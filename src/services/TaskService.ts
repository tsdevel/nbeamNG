import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logEvent } from './EventService';
import { NotFoundError } from '../lib/errors';

const DEFAULT_LEASE_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_ATTEMPTS = 3;

export interface CreateTaskInput {
  project_id: string;
  customer_id: string;
  type: string;
  capability: string;
  payload: Record<string, unknown>;
  max_attempts?: number;
}

export async function createTask(input: CreateTaskInput) {
  const task = await prisma.task.create({
    data: {
      project_id: input.project_id,
      customer_id: input.customer_id,
      type: input.type,
      capability: input.capability,
      payload: input.payload as Prisma.InputJsonValue,
      max_attempts: input.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
      status: 'pending',
    },
  });

  await logEvent({
    project_id: input.project_id,
    customer_id: input.customer_id,
    event_type: 'task_created',
    payload: {
      task_id: task.id,
      type: input.type,
      capability: input.capability,
    },
  });

  return task;
}

export async function pollPendingTasks(
  capability: string,
  customer_id: string,
  limit = 10
) {
  return prisma.task.findMany({
    where: {
      customer_id,
      capability,
      status: 'pending',
      OR: [
        { lease_expires_at: null },
        { lease_expires_at: { lt: new Date() } },
      ],
    },
    orderBy: { created_at: 'asc' },
    take: limit,
  });
}

/**
 * Atomically claim a pending task using row-level locking.
 * Uses a simple read-then-update pattern; production would use
 * FOR UPDATE SKIP LOCKED via $queryRaw for true concurrency safety.
 */
export async function claimTask(
  taskId: string,
  customerId: string,
  claimedBy: string,
  leaseDurationMs = DEFAULT_LEASE_MS
) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      customer_id: customerId,
      status: 'pending',
      OR: [
        { lease_expires_at: null },
        { lease_expires_at: { lt: new Date() } },
      ],
    },
  });

  if (!task) {
    return null;
  }

  // Atomic update: if another agent claimed it between read and update,
  // the status filter ensures this only succeeds for unclaimed tasks.
  const updated = await prisma.task.updateMany({
    where: {
      id: taskId,
      customer_id: customerId,
      status: 'pending',
    },
    data: {
      status: 'claimed',
      claimed_by: claimedBy,
      lease_expires_at: new Date(Date.now() + leaseDurationMs),
      attempts: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    return null; // Another agent claimed it first
  }

  return prisma.task.findUnique({ where: { id: taskId } });
}

export async function heartbeatTask(taskId: string, customerId: string, leaseDurationMs = DEFAULT_LEASE_MS) {
  return prisma.task.update({
    where: { id: taskId, customer_id: customerId },
    data: {
      heartbeat_at: new Date(),
      lease_expires_at: new Date(Date.now() + leaseDurationMs),
    },
  });
}

export async function startTask(taskId: string, customerId: string) {
  return prisma.task.update({
    where: { id: taskId, customer_id: customerId },
    data: { status: 'in_progress' },
  });
}

export async function completeTask(
  taskId: string,
  customerId: string,
  output: Record<string, unknown>
) {
  const task = await prisma.task.update({
    where: { id: taskId, customer_id: customerId },
    data: {
      status: 'completed',
      payload: {
        ...(await prisma.task.findUnique({ where: { id: taskId, customer_id: customerId } }))?.payload as object,
        ...output,
      } as Prisma.InputJsonValue,
    },
  });

  await logEvent({
    project_id: task.project_id,
    customer_id: task.customer_id,
    event_type: 'task_completed',
    payload: {
      task_id: task.id,
      type: task.type,
      output,
    },
  });

  return task;
}

export async function failTask(taskId: string, customerId: string, errorMessage: string) {
  const task = await prisma.task.update({
    where: { id: taskId, customer_id: customerId },
    data: {
      status: 'failed',
      payload: {
        ...(await prisma.task.findUnique({ where: { id: taskId, customer_id: customerId } }))?.payload as object,
        error: errorMessage,
        failed_at: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  await logEvent({
    project_id: task.project_id,
    customer_id: task.customer_id,
    event_type: 'task_failed',
    payload: {
      task_id: task.id,
      type: task.type,
      error: errorMessage,
    },
  });

  return task;
}

export async function getTask(id: string, customer_id: string) {
  const task = await prisma.task.findFirst({
    where: { id, customer_id },
    include: { agent_runs: true },
  });

  if (!task) {
    throw new NotFoundError('Task', id);
  }

  return task;
}

export async function listTasks(project_id: string, customer_id: string) {
  return prisma.task.findMany({
    where: { project_id, customer_id },
    orderBy: { created_at: 'desc' },
  });
}