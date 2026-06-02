import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { createProject, getProject, listProjects } from '../services/ProjectService';
import { listArtifacts } from '../services/ArtifactService';
import { ValidationError } from '../lib/errors';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  target_company: z.string().optional(),
  description: z.string().optional(),
  confidentiality_class: z.enum(['confidential', 'public', 'unknown']).optional(),
});

// POST /projects
router.post('/', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const project = await createProject({
      customer_id: req.customer_id!,
      name: parsed.data.name,
      target_company: parsed.data.target_company,
      description: parsed.data.description,
      confidentiality_class: parsed.data.confidentiality_class,
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// GET /projects
router.get('/', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const projects = await listProjects(req.customer_id!);
    res.json({ projects });
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const project = await getProject(req.params.id, req.customer_id!);
    res.json(project);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/artifacts
router.get('/:id/artifacts', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const project = await getProject(req.params.id, req.customer_id!);
    const currentVersion = project.workspace_versions[0];

    if (!currentVersion) {
      res.json({ artifacts: [] });
      return;
    }

    const artifacts = await listArtifacts(
      req.params.id,
      currentVersion.id,
      req.customer_id!
    );

    res.json({
      project_id: req.params.id,
      workspace_version: currentVersion.version_number,
      artifacts,
    });
  } catch (err) {
    next(err);
  }
});

export default router;