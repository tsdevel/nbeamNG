import { prisma } from '../lib/prisma';
import { logEvent } from './EventService';
import { NotFoundError, ValidationError } from '../lib/errors';

export interface CreateProjectInput {
  customer_id: string;
  name: string;
  target_company?: string;
  description?: string;
  confidentiality_class?: 'confidential' | 'public' | 'unknown';
}

export async function createProject(input: CreateProjectInput) {
  const confidentialityClass = input.confidentiality_class ?? 'unknown';

  const project = await prisma.project.create({
    data: {
      customer_id: input.customer_id,
      name: input.name,
      target_company: input.target_company,
      description: input.description,
      confidentiality_class: confidentialityClass,
      status: 'active',
    },
  });

  // Auto-create workspace version 1 for every new project
  await prisma.workspaceVersion.create({
    data: {
      project_id: project.id,
      customer_id: project.customer_id,
      version_number: 1,
    },
  });

  await logEvent({
    project_id: project.id,
    customer_id: project.customer_id,
    event_type: 'project_created',
    payload: {
      project_id: project.id,
      name: project.name,
      confidentiality_class: confidentialityClass,
    },
  });

  return project;
}

export async function getProject(id: string, customer_id: string) {
  const project = await prisma.project.findFirst({
    where: { id, customer_id },
    include: {
      workspace_versions: {
        orderBy: { version_number: 'desc' },
        take: 1,
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project', id);
  }

  return project;
}

export async function listProjects(customer_id: string) {
  return prisma.project.findMany({
    where: { customer_id },
    orderBy: { created_at: 'desc' },
  });
}