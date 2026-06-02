import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  createDataNeed,
  listDataNeeds,
  getDataNeed,
  resolveDataNeed,
  markDataNeedUnavailable,
  markDataNeedNeedsHumanInput,
} from '../services/DataNeedService';
import { ValidationError } from '../lib/errors';

const router = Router();

const createSchema = z.object({
  type: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  description: z.string().min(1),
  requestor_task_id: z.string().optional(),
});

// POST /projects/:id/dataneeds
router.post('/projects/:id/dataneeds', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const dn = await createDataNeed({
      project_id: req.params.id,
      customer_id: req.customer_id!,
      type: parsed.data.type,
      priority: parsed.data.priority,
      description: parsed.data.description,
      requestor_task_id: parsed.data.requestor_task_id,
    });

    res.status(201).json(dn);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/dataneeds
router.get('/projects/:id/dataneeds', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const status = req.query.status as string | undefined;
    const dns = await listDataNeeds(req.params.id, req.customer_id!, status);
    res.json({ data_needs: dns });
  } catch (err) {
    next(err);
  }
});

// GET /dataneeds/:id
router.get('/dataneeds/:id', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dn = await getDataNeed(req.params.id, req.customer_id!);
    res.json(dn);
  } catch (err) {
    next(err);
  }
});

// POST /dataneeds/:id/resolve
router.post('/dataneeds/:id/resolve', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const dn = await resolveDataNeed(
      req.params.id,
      req.customer_id!,
      req.body.resolution_artifact_id as string | undefined,
      req.body.notes as string | undefined
    );
    res.json(dn);
  } catch (err) {
    next(err);
  }
});

// POST /dataneeds/:id/unavailable
router.post('/dataneeds/:id/unavailable', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const notes = (req.body.notes as string) || 'Data unavailable';
    const dn = await markDataNeedUnavailable(req.params.id, req.customer_id!, notes);
    res.json(dn);
  } catch (err) {
    next(err);
  }
});

// POST /dataneeds/:id/needs-human-input
router.post('/dataneeds/:id/needs-human-input', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const notes = (req.body.notes as string) || 'Requires human input';
    const dn = await markDataNeedNeedsHumanInput(req.params.id, req.customer_id!, notes);
    res.json(dn);
  } catch (err) {
    next(err);
  }
});

export default router;