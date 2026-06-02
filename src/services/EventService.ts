import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export async function logEvent(params: {
  project_id?: string;
  customer_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await prisma.event.create({
    data: {
      project_id: params.project_id,
      customer_id: params.customer_id,
      tenant_id: params.customer_id,
      event_type: params.event_type,
      payload: params.payload as Prisma.InputJsonValue,
    },
  });
}