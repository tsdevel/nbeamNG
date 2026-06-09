import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { createProject, getProject, listProjects, getLinkedProjects, getDossierClaims } from '../services/ProjectService';
import { listArtifacts } from '../services/ArtifactService';
import {
  createReviewComment,
  listReviewComments,
  createWorkspaceVersion,
  listWorkspaceVersions,
  createRegenerationTask,
} from '../services/ReviewService';
import {
  analyzeImpact,
  confirmImpact,
} from '../services/ImpactAnalyzerService';
import { evaluateCompletion } from '../services/CompletionEvaluatorService';
import { closeoutProject, redactProject, purgeProject } from '../services/DeletionService';
import { distillExpertise } from '../services/ExpertiseService';
import { ValidationError } from '../lib/errors';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  target_company: z.string().optional(),
  description: z.string().optional(),
  confidentiality_class: z.enum(['confidential', 'public', 'unknown']).optional(),
  parent_project_id: z.string().optional(),
  dossier_id: z.string().optional(),
});

const createReviewSchema = z.object({
  workspace_version_id: z.string().min(1),
  type: z.enum(['correction', 'new_evidence', 'judgment_change', 'style_change', 'question', 'approval']),
  text: z.string().min(1),
  target_claim_id: z.string().optional(),
});

const createVersionSchema = z.object({
  parent_version_id: z.string().min(1),
});

const createRegenerationSchema = z.object({
  version_id: z.string().min(1),
  section_names: z.array(z.string().min(1)).min(1),
  review_comment_id: z.string().min(1),
});

const distillSchema = z.object({
  lessons: z.array(
    z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().min(1),
    })
  ).min(1),
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
      parent_project_id: parsed.data.parent_project_id,
      dossier_id: parsed.data.dossier_id,
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

// POST /projects/:id/reviews
router.post('/:id/reviews', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const comment = await createReviewComment(req.params.id, req.customer_id!, {
      workspace_version_id: parsed.data.workspace_version_id,
      type: parsed.data.type,
      text: parsed.data.text,
      target_claim_id: parsed.data.target_claim_id,
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/reviews
router.get('/:id/reviews', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const comments = await listReviewComments(req.params.id, req.customer_id!);
    res.json({ reviews: comments });
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/workspace-versions
router.post('/:id/workspace-versions', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = createVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const version = await createWorkspaceVersion(req.params.id, req.customer_id!, {
      parent_version_id: parsed.data.parent_version_id,
    });

    res.status(201).json(version);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/workspace-versions
router.get('/:id/workspace-versions', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const versions = await listWorkspaceVersions(req.params.id, req.customer_id!);
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/regenerate
router.post('/:id/regenerate', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = createRegenerationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const task = await createRegenerationTask(req.params.id, req.customer_id!, {
      version_id: parsed.data.version_id,
      section_names: parsed.data.section_names,
      review_comment_id: parsed.data.review_comment_id,
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/reviews/:reviewId/impact
router.get('/:id/reviews/:reviewId/impact', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await analyzeImpact(req.params.reviewId, req.params.id, req.customer_id!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/reviews/:reviewId/confirm-impact
router.post('/:id/reviews/:reviewId/confirm-impact', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const confirmedSections = (req.body.confirmed_sections as string[]) || [];
    const result = await confirmImpact(req.params.reviewId, req.params.id, req.customer_id!, {
      confirmed_sections: confirmedSections,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/linked
router.get('/:id/linked', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await getLinkedProjects(req.params.id, req.customer_id!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/dossier
router.get('/:id/dossier', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await getDossierClaims(req.params.id, req.customer_id!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/closeout
router.post('/:id/closeout', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await closeoutProject(req.params.id, req.customer_id!);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/redact
router.post('/:id/redact', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await redactProject(req.params.id, req.customer_id!);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/purge
router.post('/:id/purge', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await purgeProject(req.params.id, req.customer_id!);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/distill
router.post('/:id/distill', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = distillSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    const result = await distillExpertise(req.params.id, req.customer_id!, parsed.data.lessons);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/finalize
router.post('/:id/finalize', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await evaluateCompletion(req.params.id, req.customer_id!);
    res.status(result.passed ? 200 : 409).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;