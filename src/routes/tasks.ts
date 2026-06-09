import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  createTask,
  pollPendingTasks,
  claimTask,
  heartbeatTask,
  startTask,
  completeTask,
  failTask,
  getTask,
  listTasks,
} from '../services/TaskService';
import {
  createAgentRun,
  executeResearchAgent,
  executeRegenerationAgent,
} from '../services/AgentService';
import { ValidationError } from '../lib/errors';

const router = Router();

const createTaskSchema = z.object({
  type: z.string().min(1),
  capability: z.string().min(1),
  payload: z.record(z.unknown()),
  max_attempts: z.number().int().min(1).max(10).optional(),
});

// POST /projects/:id/tasks
router.post('/projects/:id/tasks', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }

    const task = await createTask({
      project_id: req.params.id,
      customer_id: req.customer_id!,
      type: parsed.data.type,
      capability: parsed.data.capability,
      payload: parsed.data.payload,
      max_attempts: parsed.data.max_attempts,
    });

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// GET /tasks — poll for pending tasks (agent runtime discovery)
router.get('/tasks', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const capability = req.query.capability as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const tasks = await pollPendingTasks(
      capability || 'research',
      req.customer_id!,
      limit
    );

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/claim
router.post('/tasks/:id/claim', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    // Verify task exists and belongs to this customer (404 if not)
    await getTask(req.params.id, req.customer_id!);

    const claimedBy = (req.body.claimed_by as string) || 'anonymous-agent';
    const leaseDurationMs = parseInt(req.body.lease_duration_ms as string) || 5 * 60 * 1000;

    const task = await claimTask(req.params.id, req.customer_id!, claimedBy, leaseDurationMs);

    if (!task) {
      res.status(409).json({ error: { code: 'ALREADY_CLAIMED', message: 'Task was claimed by another agent' } });
      return;
    }

    // Create agent run record
    const agentRun = await createAgentRun({
      project_id: task.project_id,
      customer_id: task.customer_id,
      task_id: task.id,
      agent_type: 'research',
    });

    res.json({ task, agent_run: agentRun });
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/heartbeat
router.post('/tasks/:id/heartbeat', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const leaseDurationMs = parseInt(req.body.lease_duration_ms as string) || 5 * 60 * 1000;
    const task = await heartbeatTask(req.params.id, req.customer_id!, leaseDurationMs);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/start
router.post('/tasks/:id/start', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const task = await startTask(req.params.id, req.customer_id!);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/complete
router.post('/tasks/:id/complete', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const output = (req.body.output as Record<string, unknown>) || {};
    const task = await completeTask(req.params.id, req.customer_id!, output);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/fail
router.post('/tasks/:id/fail', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const errorMessage = (req.body.error as string) || 'Unknown error';
    const task = await failTask(req.params.id, req.customer_id!, errorMessage);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// GET /tasks/:id
router.get('/tasks/:id', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const task = await getTask(req.params.id, req.customer_id!);
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/tasks
router.get('/projects/:id/tasks', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tasks = await listTasks(req.params.id, req.customer_id!);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/execute-research — convenience endpoint for Slice 2 demo
router.post('/tasks/:id/execute-research', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const task = await getTask(req.params.id, req.customer_id!);

    if (task.status !== 'claimed' && task.status !== 'in_progress') {
      res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Task must be claimed or in-progress' } });
      return;
    }

    const runId = task.agent_runs[0]?.id;
    if (!runId) {
      res.status(400).json({ error: { code: 'NO_AGENT_RUN', message: 'No agent run associated with this task' } });
      return;
    }

    const result = await executeResearchAgent(task.id, runId, req.customer_id!);

    // Complete the task with output reference
    await completeTask(task.id, req.customer_id!, { output_artifact_id: result.artifactId });

    res.json({
      task_id: task.id,
      agent_run_id: runId,
      artifact_id: result.artifactId,
      summary: result.summary,
      data_needs: result.dataNeeds,
    });
  } catch (err) {
    next(err);
  }
});

// POST /tasks/:id/execute-regeneration — convenience endpoint for Slice 6 demo
router.post('/tasks/:id/execute-regeneration', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const task = await getTask(req.params.id, req.customer_id!);

    if (task.status !== 'claimed' && task.status !== 'in_progress') {
      res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Task must be claimed or in-progress' } });
      return;
    }

    const runId = task.agent_runs[0]?.id;
    if (!runId) {
      res.status(400).json({ error: { code: 'NO_AGENT_RUN', message: 'No agent run associated with this task' } });
      return;
    }

    const result = await executeRegenerationAgent(task.id, runId, req.customer_id!);

    // Complete the task with output reference
    await completeTask(task.id, req.customer_id!, { output_artifact_id: result.artifactId });

    res.json({
      task_id: task.id,
      agent_run_id: runId,
      artifact_id: result.artifactId,
      lineage: result.lineage,
    });
  } catch (err) {
    next(err);
  }
});

export default router;