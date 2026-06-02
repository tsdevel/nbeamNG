import pdfParse from 'pdf-parse';
import { prisma } from '../lib/prisma';
import { sha256, deterministicArtifactId } from '../lib/hash';
import { logEvent } from './EventService';
import { NotFoundError } from '../lib/errors';

export async function ingestPdfArtifact(
  artifactId: string,
  customerId: string,
  fileBuffer: Buffer
): Promise<{ artifactId: string; extractedText: string; pageCount: number }> {
  const sourceArtifact = await prisma.artifact.findFirst({
    where: { id: artifactId, customer_id: customerId },
  });

  if (!sourceArtifact) {
    throw new NotFoundError('Artifact', artifactId);
  }

  const projectId = sourceArtifact.project_id;
  const workspaceVersionId = sourceArtifact.workspace_version_id;

  // Extract text from PDF
  const parsed = await pdfParse(fileBuffer, {
    // Prevent pdf-parse from trying to render/test
    pagerender: undefined,
  });

  const extractedText = parsed.text || '';
  const pageCount = parsed.numpages || 0;

  // Deterministic ID for extracted text artifact
  const extractedId = deterministicArtifactId(
    projectId,
    sourceArtifact.file_hash!,
    'extracted_text',
    'v1'
  );

  // Check idempotency: already ingested?
  const existing = await prisma.artifact.findUnique({
    where: { id: extractedId },
  });

  if (existing) {
    return {
      artifactId: existing.id,
      extractedText: existing.extracted_text || '',
      pageCount,
    };
  }

  // Create extracted text artifact (Juice — stored in DB, not object storage)
  const extractedArtifact = await prisma.artifact.create({
    data: {
      id: extractedId,
      project_id: projectId,
      workspace_version_id: workspaceVersionId,
      customer_id: customerId,
      type: 'extracted_text',
      name: `${sourceArtifact.name} — Extracted Text`,
      mime_type: 'text/plain',
      extracted_text: extractedText,
      source_artifact_ids: [artifactId],
      status: 'draft',
      metadata: {
        page_count: pageCount,
        extraction_version: 'v1',
        source_artifact_id: artifactId,
      },
    },
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'artifact_ingested',
    payload: {
      source_artifact_id: artifactId,
      extracted_artifact_id: extractedArtifact.id,
      project_id: projectId,
      page_count: pageCount,
      extraction_version: 'v1',
    },
  });

  return {
    artifactId: extractedArtifact.id,
    extractedText,
    pageCount,
  };
}