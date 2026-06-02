import { createHash } from 'crypto';

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Deterministic artifact ID based on project, file hash, and type.
 * Guarantees idempotency: same inputs → same ID.
 */
export function deterministicArtifactId(
  projectId: string,
  fileHash: string,
  type: string,
  extractionVersion = 'v1'
): string {
  return sha256(`${projectId}:${fileHash}:${type}:${extractionVersion}`).slice(0, 24);
}

export function generateStorageKey(
  projectId: string,
  artifactId: string,
  originalName: string
): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
  return `${projectId}/${artifactId}.${ext}`;
}