import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logEvent } from './EventService';
import { NotFoundError, ValidationError } from '../lib/errors';
import { createTask } from './TaskService';

export type ReviewCommentType = 'correction' | 'new_evidence' | 'judgment_change' | 'style_change' | 'question' | 'approval';

export interface CreateReviewCommentInput {
  workspace_version_id: string;
  type: ReviewCommentType;
  text: string;
  target_claim_id?: string;
}

export interface CreateWorkspaceVersionInput {
  parent_version_id: string;
}

export interface CreateRegenerationTaskInput {
  version_id: string;
  section_names: string[];
  review_comment_id: string;
}

export async function createReviewComment(
  projectId: string,
  customerId: string,
  input: CreateReviewCommentInput
) {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Verify workspace version belongs to this project
  const version = await prisma.workspaceVersion.findFirst({
    where: { id: input.workspace_version_id, project_id: projectId, customer_id: customerId },
  });
  if (!version) {
    throw new NotFoundError('Workspace version not found');
  }

  // If target_claim_id provided, verify claim exists in this version
  if (input.target_claim_id) {
    const claim = await prisma.claim.findFirst({
      where: {
        id: input.target_claim_id,
        project_id: projectId,
        customer_id: customerId,
        workspace_version_id: input.workspace_version_id,
      },
    });
    if (!claim) {
      throw new NotFoundError('Target claim not found');
    }
  }

  // Create review comment
  const comment = await prisma.reviewComment.create({
    data: {
      project_id: projectId,
      customer_id: customerId,
      workspace_version_id: input.workspace_version_id,
      type: input.type as any,
      text: input.text,
      target_claim_id: input.target_claim_id,
    },
  });

  // If correction type and target claim exists, invalidate the claim
  if (input.type === 'correction' && input.target_claim_id) {
    await prisma.claim.update({
      where: { id: input.target_claim_id },
      data: {
        status: 'invalidated',
        invalidated_by_comment_id: comment.id,
      },
    });
  }

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'review_comment_created',
    payload: {
      comment_id: comment.id,
      type: input.type,
      target_claim_id: input.target_claim_id,
      invalidated_claim: input.type === 'correction' && input.target_claim_id ? true : false,
    },
  });

  return comment;
}

export async function listReviewComments(projectId: string, customerId: string) {
  return prisma.reviewComment.findMany({
    where: { project_id: projectId, customer_id: customerId },
    include: { target_claim: true, invalidated_claims: true },
    orderBy: { created_at: 'desc' },
  });
}

export async function getReviewComment(id: string, customerId: string) {
  const comment = await prisma.reviewComment.findFirst({
    where: { id, customer_id: customerId },
    include: { target_claim: true, invalidated_claims: true },
  });
  if (!comment) {
    throw new NotFoundError('Review comment not found');
  }
  return comment;
}

export async function createWorkspaceVersion(
  projectId: string,
  customerId: string,
  input: CreateWorkspaceVersionInput
) {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Verify parent version exists in this project
  const parentVersion = await prisma.workspaceVersion.findFirst({
    where: { id: input.parent_version_id, project_id: projectId, customer_id: customerId },
  });
  if (!parentVersion) {
    throw new NotFoundError('Parent workspace version not found');
  }

  // Determine next version number for this project
  const latestVersion = await prisma.workspaceVersion.findFirst({
    where: { project_id: projectId },
    orderBy: { version_number: 'desc' },
  });
  const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

  const newVersion = await prisma.workspaceVersion.create({
    data: {
      project_id: projectId,
      customer_id: customerId,
      version_number: nextVersionNumber,
      parent_version_id: input.parent_version_id,
    },
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'workspace_version_created',
    payload: {
      version_id: newVersion.id,
      version_number: nextVersionNumber,
      parent_version_id: input.parent_version_id,
    },
  });

  return newVersion;
}

export async function listWorkspaceVersions(projectId: string, customerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  return prisma.workspaceVersion.findMany({
    where: { project_id: projectId, customer_id: customerId },
    orderBy: { version_number: 'asc' },
  });
}

export async function createRegenerationTask(
  projectId: string,
  customerId: string,
  input: CreateRegenerationTaskInput
) {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Verify version exists in this project
  const version = await prisma.workspaceVersion.findFirst({
    where: { id: input.version_id, project_id: projectId, customer_id: customerId },
  });
  if (!version) {
    throw new NotFoundError('Workspace version not found');
  }

  // Verify review comment exists
  const comment = await prisma.reviewComment.findFirst({
    where: { id: input.review_comment_id, project_id: projectId, customer_id: customerId },
  });
  if (!comment) {
    throw new NotFoundError('Review comment not found');
  }

  if (input.section_names.length === 0) {
    throw new ValidationError('At least one section must be selected for regeneration');
  }

  const task = await createTask({
    project_id: projectId,
    customer_id: customerId,
    type: 'regeneration',
    capability: 'regeneration',
    payload: {
      version_id: input.version_id,
      section_names: input.section_names,
      review_comment_id: input.review_comment_id,
      review_comment_text: comment.text,
    },
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'regeneration_task_created',
    payload: {
      task_id: task.id,
      version_id: input.version_id,
      section_names: input.section_names,
      review_comment_id: input.review_comment_id,
    },
  });

  return task;
}
