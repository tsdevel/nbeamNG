import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { listExpertise, approveExpertise, rejectExpertise } from '../services/ExpertiseService';
import { NotFoundError } from '../lib/errors';

const router = Router();

// GET /expertise
router.get('/', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const status = req.query.status as string | undefined;
    const lessons = await listExpertise(req.customer_id!, status);
    res.json({ lessons });
  } catch (err) {
    next(err);
  }
});

// POST /expertise/:id/approve
router.post('/:id/approve', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const lesson = await approveExpertise(req.params.id, req.customer_id!);
    res.status(200).json(lesson);
  } catch (err) {
    next(err);
  }
});

// POST /expertise/:id/reject
router.post('/:id/reject', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const lesson = await rejectExpertise(req.params.id, req.customer_id!);
    res.status(200).json(lesson);
  } catch (err) {
    next(err);
  }
});

export default router;
