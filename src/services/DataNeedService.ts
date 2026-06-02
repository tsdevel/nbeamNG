import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logEvent } from './EventService';
import { NotFoundError } from '../lib/errors';

export interface CreateDataNeedInput {
  project_id: string;
  customer_id: string;
  type: string;
  priority?: string;
  description: string;
  requestor_task_id?: string;
}

export async function createDataNeed(input: CreateDataNeedInput) {
  const dataNeed = await prisma.dataNeed.create({
    data: {
      project_id: input.project_id,
      customer_id: input.customer_id,
      type: input.type,
      priority: input.priority ?? 'medium',
      description: input.description,
      requestor_task_id: input.requestor_task_id,
      status: 'open',
    },
  });

  await logEvent({
    project_id: input.project_id,
    customer_id: input.customer_id,
    event_type: 'dataneed_created',
    payload: {
      dataneed_id: dataNeed.id,
      type: input.type,
      description: input.description,
    },
  });

  return dataNeed;
}

export async function listDataNeeds(project_id: string, customer_id: string, status?: string) {
  return prisma.dataNeed.findMany({
    where: {
      project_id,
      customer_id,
      ...(status ? { status: status as any } : {}),
    },
    orderBy: [
      { priority: 'desc' },
      { created_at: 'asc' },
    ],
  });
}

export async function getDataNeed(id: string, customer_id: string) {
  const dn = await prisma.dataNeed.findFirst({
    where: { id, customer_id },
  });

  if (!dn) {
    throw new NotFoundError('DataNeed', id);
  }

  return dn;
}

export async function resolveDataNeed(
  id: string,
  customer_id: string,
  resolutionArtifactId?: string,
  notes?: string
) {
  try {
    const dn = await prisma.dataNeed.update({
      where: { id, customer_id },
      data: {
        status: 'resolved',
        resolution_artifact_id: resolutionArtifactId,
        resolution_notes: notes,
      },
    });

    await logEvent({
      project_id: dn.project_id,
      customer_id,
      event_type: 'dataneed_resolved',
      payload: {
        dataneed_id: dn.id,
        resolution_artifact_id: resolutionArtifactId,
        notes,
      },
    });

    return dn;
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError('DataNeed', id);
    }
    throw err;
  }
}

export async function markDataNeedUnavailable(
  id: string,
  customer_id: string,
  notes: string
) {
  try {
    const dn = await prisma.dataNeed.update({
      where: { id, customer_id },
      data: {
        status: 'unavailable',
        resolution_notes: notes,
      },
    });

    await logEvent({
      project_id: dn.project_id,
      customer_id,
      event_type: 'dataneed_unavailable',
      payload: {
        dataneed_id: dn.id,
        notes,
      },
    });

    return dn;
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError('DataNeed', id);
    }
    throw err;
  }
}

export async function markDataNeedNeedsHumanInput(
  id: string,
  customer_id: string,
  notes: string
) {
  try {
    const dn = await prisma.dataNeed.update({
      where: { id, customer_id },
      data: {
        status: 'needs_human_input',
        resolution_notes: notes,
      },
    });

    await logEvent({
      project_id: dn.project_id,
      customer_id,
      event_type: 'dataneed_needs_human_input',
      payload: {
        dataneed_id: dn.id,
        notes,
      },
    });

    return dn;
  } catch (err: any) {
    if (err.code === 'P2025') {
      throw new NotFoundError('DataNeed', id);
    }
    throw err;
  }
}