import { prisma } from '../lib/prisma';
import { minioClient, ensureBucketExists, getObjectUrl } from '../lib/minio';
import { config } from '../lib/config';
import { sha256, deterministicArtifactId, generateStorageKey } from '../lib/hash';
import { logEvent } from './EventService';
import { NotFoundError, ConflictError } from '../lib/errors';

export interface UploadInput {
  project_id: string;
  customer_id: string;
  file: Buffer;
  original_name: string;
  mime_type: string;
}

export async function uploadArtifact(input: UploadInput) {
  // Validate project exists and belongs to tenant
  const project = await prisma.project.findFirst({
    where: { id: input.project_id, customer_id: input.customer_id },
    include: {
      workspace_versions: { orderBy: { version_number: 'desc' }, take: 1 },
    },
  });

  if (!project) {
    throw new NotFoundError('Project', input.project_id);
  }

  const currentVersion = project.workspace_versions[0];
  if (!currentVersion) {
    throw new NotFoundError('WorkspaceVersion for project', input.project_id);
  }

  const fileHash = sha256(input.file);
  const artifactType = 'raw_upload';

  // Idempotency: same file hash + project + type = existing artifact
  const existing = await prisma.artifact.findFirst({
    where: {
      project_id: input.project_id,
      file_hash: fileHash,
      type: artifactType,
    },
  });

  if (existing) {
    return { artifact: existing, isDuplicate: true };
  }

  const artifactId = deterministicArtifactId(
    input.project_id,
    fileHash,
    artifactType,
    'v1'
  );

  const storageKey = generateStorageKey(input.project_id, artifactId, input.original_name);

  // Upload to MinIO
  await ensureBucketExists(config.MINIO_BUCKET);
  await minioClient.putObject(
    config.MINIO_BUCKET,
    storageKey,
    input.file,
    input.file.length,
    { 'Content-Type': input.mime_type }
  );

  // Create artifact record
  const artifact = await prisma.artifact.create({
    data: {
      id: artifactId,
      project_id: input.project_id,
      workspace_version_id: currentVersion.id,
      customer_id: input.customer_id,
      type: artifactType,
      name: input.original_name,
      mime_type: input.mime_type,
      storage_bucket: config.MINIO_BUCKET,
      storage_key: storageKey,
      file_hash: fileHash,
      status: 'draft',
    },
  });

  await logEvent({
    project_id: input.project_id,
    customer_id: input.customer_id,
    event_type: 'artifact_uploaded',
    payload: {
      artifact_id: artifact.id,
      project_id: input.project_id,
      file_hash: fileHash,
      file_name: input.original_name,
      mime_type: input.mime_type,
    },
  });

  return { artifact, isDuplicate: false };
}

export async function getArtifact(id: string, customer_id: string) {
  const artifact = await prisma.artifact.findFirst({
    where: { id, customer_id },
  });

  if (!artifact) {
    throw new NotFoundError('Artifact', id);
  }

  return artifact;
}

export async function listArtifacts(
  project_id: string,
  workspace_version_id: string,
  customer_id: string
) {
  return prisma.artifact.findMany({
    where: {
      project_id,
      workspace_version_id,
      customer_id,
    },
    orderBy: { created_at: 'desc' },
  });
}

export async function getArtifactContent(artifactId: string, customer_id: string): Promise<Buffer> {
  const artifact = await getArtifact(artifactId, customer_id);

  if (!artifact.storage_bucket || !artifact.storage_key) {
    throw new NotFoundError('Artifact content', artifactId);
  }

  const stream = await minioClient.getObject(
    artifact.storage_bucket,
    artifact.storage_key
  );

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}