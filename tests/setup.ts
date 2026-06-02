import { prisma } from '../src/lib/prisma';
import { minioClient, ensureBucketExists } from '../src/lib/minio';
import { config } from '../src/lib/config';

beforeAll(async () => {
  await ensureBucketExists(config.MINIO_BUCKET);
});

afterEach(async () => {
  // Clean database tables in dependency order
  await prisma.$executeRaw`TRUNCATE TABLE "DataNeed" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "AgentRun" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Task" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Event" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Artifact" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "WorkspaceVersion" CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE "Project" CASCADE`;

  // Clean MinIO bucket
  const objects: string[] = [];
  const stream = minioClient.listObjects(config.MINIO_BUCKET, '', true);
  for await (const obj of stream) {
    objects.push(obj.name);
  }
  for (const name of objects) {
    await minioClient.removeObject(config.MINIO_BUCKET, name);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});