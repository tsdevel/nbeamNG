import { Client } from 'minio';
import { config } from './config';

export const minioClient = new Client({
  endPoint: config.MINIO_ENDPOINT,
  port: config.MINIO_PORT,
  useSSL: config.MINIO_USE_SSL,
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
});

export async function ensureBucketExists(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket);
  }
}

export function getObjectUrl(bucket: string, key: string): string {
  const protocol = config.MINIO_USE_SSL ? 'https' : 'http';
  return `${protocol}://${config.MINIO_ENDPOINT}:${config.MINIO_PORT}/${bucket}/${key}`;
}