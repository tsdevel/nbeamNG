import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { extractClaimsFromArtifact, listClaims, getClaim } from '../services/ClaimService';
import { ValidationError } from '../lib/errors';

const router = Router();

// POST /artifacts/:id/extract-claims
router.post('/artifacts/:id/extract-claims', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await extractClaimsFromArtifact(req.params.id, req.customer_id!);
    res.status(201).json({
      artifact_id: req.params.id,
      claims_created: result.claims.length,
      evidence_created: result.evidence.length,
      claims: result.claims,
      evidence: result.evidence,
    });
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/claims
router.get('/projects/:id/claims', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const claims = await listClaims(req.params.id, req.customer_id!);
    res.json({ claims });
  } catch (err) {
    next(err);
  }
});

// GET /claims/:id
router.get('/claims/:id', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const claim = await getClaim(req.params.id, req.customer_id!);
    res.json(claim);
  } catch (err) {
    next(err);
  }
});

export default router;