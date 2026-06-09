import { prisma } from '../lib/prisma';
import { NotFoundError } from '../lib/errors';

export interface LessonInput {
  title: string;
  content: string;
  category: string;
}

export async function distillExpertise(
  projectId: string,
  customerId: string,
  lessons: LessonInput[]
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project', projectId);
  }

  const created = await Promise.all(
    lessons.map((l) =>
      prisma.expertiseLesson.create({
        data: {
          customer_id: customerId,
          source_project_id: projectId,
          title: l.title,
          content: l.content,
          category: l.category,
          status: 'draft',
          scrubbed: false,
        },
      })
    )
  );

  return { lessons: created };
}

export async function approveExpertise(lessonId: string, customerId: string) {
  const lesson = await prisma.expertiseLesson.findFirst({
    where: { id: lessonId, customer_id: customerId },
  });
  if (!lesson) {
    throw new NotFoundError('ExpertiseLesson', lessonId);
  }

  const updated = await prisma.expertiseLesson.update({
    where: { id: lessonId },
    data: {
      status: 'approved',
      approved_at: new Date(),
    },
  });

  return updated;
}

export async function rejectExpertise(lessonId: string, customerId: string) {
  const lesson = await prisma.expertiseLesson.findFirst({
    where: { id: lessonId, customer_id: customerId },
  });
  if (!lesson) {
    throw new NotFoundError('ExpertiseLesson', lessonId);
  }

  const updated = await prisma.expertiseLesson.update({
    where: { id: lessonId },
    data: {
      status: 'rejected',
    },
  });

  return updated;
}

export async function listExpertise(customerId: string, status?: string) {
  const where: Record<string, unknown> = { customer_id: customerId };
  if (status) {
    where.status = status;
  }

  return prisma.expertiseLesson.findMany({
    where,
    orderBy: { created_at: 'desc' },
  });
}
