import { prisma } from '../lib/prisma';
import { logEvent } from './EventService';
import { NotFoundError, ValidationError } from '../lib/errors';

export interface CreateProjectInput {
  customer_id: string;
  name: string;
  target_company?: string;
  description?: string;
  confidentiality_class?: 'confidential' | 'public' | 'unknown';
  parent_project_id?: string;
  dossier_id?: string;
}

function generateDossierId(customer_id: string, target_company: string): string {
  const normalized = target_company.trim().toLowerCase().replace(/\s+/g, '_');
  return `dossier:${customer_id}:${normalized}`;
}

export async function createProject(input: CreateProjectInput) {
  const confidentialityClass = input.confidentiality_class ?? 'unknown';
  let target_company = input.target_company;
  let dossier_id = input.dossier_id;

  // If parent_project_id is provided, validate and inherit
  if (input.parent_project_id) {
    const parent = await prisma.project.findFirst({
      where: { id: input.parent_project_id, customer_id: input.customer_id },
    });
    if (!parent) {
      throw new NotFoundError('Parent Project', input.parent_project_id);
    }
    // Inherit dossier_id from parent if not explicitly provided
    if (!dossier_id && parent.dossier_id) {
      dossier_id = parent.dossier_id;
    }
    // Inherit target_company from parent if not explicitly provided
    if (!target_company && parent.target_company) {
      target_company = parent.target_company;
    }
  }

  // Auto-generate dossier_id from target_company if still not set
  if (!dossier_id && target_company) {
    dossier_id = generateDossierId(input.customer_id, target_company);
  }

  const project = await prisma.project.create({
    data: {
      customer_id: input.customer_id,
      name: input.name,
      target_company: target_company,
      description: input.description,
      confidentiality_class: confidentialityClass,
      status: 'active',
      parent_project_id: input.parent_project_id ?? null,
      dossier_id: dossier_id ?? null,
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
      parent_project_id: input.parent_project_id ?? null,
      dossier_id: project.dossier_id,
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
      parent_project: true,
      child_projects: {
        select: { id: true, name: true, target_company: true, status: true, created_at: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError('Project', id);
  }

  return project;
}

export async function getLinkedProjects(id: string, customer_id: string) {
  const project = await prisma.project.findFirst({
    where: { id, customer_id },
  });
  if (!project) {
    throw new NotFoundError('Project', id);
  }

  if (!project.dossier_id) {
    return { projects: [], dossier_id: null };
  }

  const projects = await prisma.project.findMany({
    where: {
      customer_id,
      dossier_id: project.dossier_id,
      id: { not: id },
    },
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      name: true,
      target_company: true,
      status: true,
      created_at: true,
      parent_project_id: true,
      dossier_id: true,
    },
  });

  return { projects, dossier_id: project.dossier_id };
}

export async function getDossierClaims(id: string, customer_id: string) {
  const project = await prisma.project.findFirst({
    where: { id, customer_id },
  });
  if (!project) {
    throw new NotFoundError('Project', id);
  }

  if (!project.dossier_id) {
    return { dossier_id: null, claims: [] };
  }

  // Fetch all claims across all projects in this dossier, with their project context
  const claims = await prisma.claim.findMany({
    where: {
      customer_id,
      project: {
        dossier_id: project.dossier_id,
      },
    },
    include: {
      project: {
        select: { id: true, name: true, target_company: true },
      },
      workspace_version: {
        select: { version_number: true },
      },
      evidence: {
        include: {
          artifact: {
            select: { id: true, name: true, type: true },
          },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  return { dossier_id: project.dossier_id, claims };
}

export async function listProjects(customer_id: string) {
  return prisma.project.findMany({
    where: { customer_id },
    orderBy: { created_at: 'desc' },
  });
}