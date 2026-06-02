import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { uploadArtifact, getArtifact, getArtifactContent } from '../services/ArtifactService';
import { ingestPdfArtifact } from '../services/IngestionService';
import { getProject } from '../services/ProjectService';
import { ValidationError } from '../lib/errors';

const router = Router();

const uploadSchema = z.object({
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  file_content: z.string().min(1), // base64 encoded
});

// POST /projects/:id/upload
router.post('/projects/:id/upload', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    // Validate project access
    await getProject(req.params.id, req.customer_id!);

    const fileBuffer = Buffer.from(parsed.data.file_content, 'base64');

    const { artifact, isDuplicate } = await uploadArtifact({
      project_id: req.params.id,
      customer_id: req.customer_id!,
      file: fileBuffer,
      original_name: parsed.data.file_name,
      mime_type: parsed.data.mime_type,
    });

    // Auto-trigger ingestion for PDFs
    let ingestionResult = null;
    if (parsed.data.mime_type === 'application/pdf' && !isDuplicate) {
      ingestionResult = await ingestPdfArtifact(
        artifact.id,
        req.customer_id!,
        fileBuffer
      );
    }

    res.status(201).json({
      artifact,
      is_duplicate: isDuplicate,
      ingestion: ingestionResult,
    });
  } catch (err) {
    next(err);
  }
});

// GET /artifacts/:id
router.get('/artifacts/:id', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const artifact = await getArtifact(req.params.id, req.customer_id!);
    res.json(artifact);
  } catch (err) {
    next(err);
  }
});

// GET /artifacts/:id/content — raw file download
router.get('/artifacts/:id/content', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const artifact = await getArtifact(req.params.id, req.customer_id!);
    const content = await getArtifactContent(req.params.id, req.customer_id!);

    res.setHeader('Content-Type', artifact.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}"`);
    res.send(content);
  } catch (err) {
    next(err);
  }
});

export default router;