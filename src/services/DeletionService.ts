import { prisma } from '../lib/prisma';
import { minioClient } from '../lib/minio';
import { logEvent } from './EventService';
import { NotFoundError } from '../lib/errors';

export async function closeoutProject(projectId: string, customerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project', projectId);
  }

  // Find raw_upload artifacts with MinIO storage
  const rawArtifacts = await prisma.artifact.findMany({
    where: {
      project_id: projectId,
      customer_id: customerId,
      type: 'raw_upload',
      storage_bucket: { not: null },
      storage_key: { not: null },
    },
  });

  // Delete from MinIO (idempotent: ignore if already gone)
  for (const artifact of rawArtifacts) {
    if (artifact.storage_bucket && artifact.storage_key) {
      try {
        await minioClient.removeObject(artifact.storage_bucket, artifact.storage_key);
      } catch {
        // Object may already be deleted or not exist — continue
      }
    }
  }

  // Mark artifacts as purged and clear storage pointers
  await prisma.artifact.updateMany({
    where: {
      project_id: projectId,
      customer_id: customerId,
      type: 'raw_upload',
    },
    data: {
      purge_status: 'purged',
      storage_bucket: null,
      storage_key: null,
      file_hash: null,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'archived' },
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'project_closeout',
    payload: {
      project_id: projectId,
      artifacts_purged: rawArtifacts.length,
      status: 'archived',
    },
  });

  return { status: 'archived', artifacts_purged: rawArtifacts.length };
}

export async function redactProject(projectId: string, customerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project', projectId);
  }

  // Delete raw_upload artifacts from MinIO if not already purged
  const rawArtifacts = await prisma.artifact.findMany({
    where: {
      project_id: projectId,
      customer_id: customerId,
      type: 'raw_upload',
      storage_bucket: { not: null },
      storage_key: { not: null },
    },
  });

  for (const artifact of rawArtifacts) {
    if (artifact.storage_bucket && artifact.storage_key) {
      try {
        await minioClient.removeObject(artifact.storage_bucket, artifact.storage_key);
      } catch {
        // Continue
      }
    }
  }

  await prisma.artifact.updateMany({
    where: {
      project_id: projectId,
      customer_id: customerId,
      type: 'raw_upload',
    },
    data: {
      purge_status: 'purged',
      storage_bucket: null,
      storage_key: null,
      file_hash: null,
    },
  });

  // Delete confidential claims (cascade-deletes their evidence via onDelete: Cascade)
  const deletedClaims = await prisma.claim.deleteMany({
    where: {
      project_id: projectId,
      customer_id: customerId,
      retention_class: 'company_specific',
    },
  });

  // Clean up any orphaned confidential evidence
  const deletedEvidence = await prisma.evidence.deleteMany({
    where: {
      project_id: projectId,
      customer_id: customerId,
      retention_class: 'company_specific',
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'purged_confidential' },
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'project_confidential_redacted',
    payload: {
      project_id: projectId,
      claims_deleted: deletedClaims.count,
      evidence_deleted: deletedEvidence.count,
      status: 'purged_confidential',
    },
  });

  return {
    status: 'purged_confidential',
    claims_deleted: deletedClaims.count,
    evidence_deleted: deletedEvidence.count,
  };
}

export async function purgeProject(projectId: string, customerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
    include: { artifacts: true },
  });
  if (!project) {
    throw new NotFoundError('Project', projectId);
  }

  // Delete all artifacts from MinIO
  for (const artifact of project.artifacts) {
    if (artifact.storage_bucket && artifact.storage_key) {
      try {
        await minioClient.removeObject(artifact.storage_bucket, artifact.storage_key);
      } catch {
        // Continue
      }
    }
  }

  // Delete events for this project (they have onDelete: SetNull, so manual cleanup needed)
  await prisma.event.deleteMany({
    where: { project_id: projectId, customer_id: customerId },
  });

  // Disassociate expertise lessons from this project (keep the lessons, just lose the link)
  await prisma.expertiseLesson.updateMany({
    where: { source_project_id: projectId, customer_id: customerId },
    data: { source_project_id: null },
  });

  // Delete the project — cascades to most related tables
  await prisma.project.delete({
    where: { id: projectId },
  });

  await logEvent({
    customer_id: customerId,
    event_type: 'project_full_purge',
    payload: {
      project_id: projectId,
      purged_at: new Date().toISOString(),
    },
  });

  return { status: 'purged' };
}
