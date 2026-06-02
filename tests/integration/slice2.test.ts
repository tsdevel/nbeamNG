import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestPdf } from '../fixtures/createTestPdf';

const API_KEY = 'dev-api-key';
const CUSTOMER_1 = 'test-customer-1';
const CUSTOMER_2 = 'test-customer-2';

function authHeaders(customerId: string) {
  return {
    'x-api-key': API_KEY,
    'x-customer-id': customerId,
  };
}

describe('Slice 2: Generate an Auditable First Draft', () => {
  let projectId: string;
  let extractedArtifactId: string;

  beforeEach(async () => {
    // Create project and upload PDF
    const projectRes = await request(app)
      .post('/projects')
      .set(authHeaders(CUSTOMER_1))
      .send({
        name: 'AcmeCorp Acquisition',
        target_company: 'AcmeCorp',
        confidentiality_class: 'confidential',
      })
      .expect(201);
    projectId = projectRes.body.id;

    const pdfBuffer = createTestPdf();
    const base64 = pdfBuffer.toString('base64');

    const uploadRes = await request(app)
      .post(`/projects/${projectId}/upload`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        file_name: 'CIM_AcmeCorp.pdf',
        mime_type: 'application/pdf',
        file_content: base64,
      })
      .expect(201);

    // Get the extracted_text artifact
    const artifactsRes = await request(app)
      .get(`/projects/${projectId}/artifacts`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const extracted = artifactsRes.body.artifacts.find((a: any) => a.type === 'extracted_text');
    expect(extracted).toBeDefined();
    extractedArtifactId = extracted.id;
  });

  it('creates a research task referencing the extracted artifact', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    expect(res.body).toMatchObject({
      project_id: projectId,
      type: 'research',
      capability: 'research',
      status: 'pending',
      customer_id: CUSTOMER_1,
    });
    expect(res.body.payload).toMatchObject({ artifact_id: extractedArtifactId });
  });

  it('polls for pending tasks by capability', async () => {
    await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    const res = await request(app)
      .get('/tasks?capability=research')
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].capability).toBe('research');
    expect(res.body.tasks[0].status).toBe('pending');
  });

  it('claims a pending task and creates an agent run record', async () => {
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    const claimRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'test-agent-1' })
      .expect(200);

    expect(claimRes.body.task.status).toBe('claimed');
    expect(claimRes.body.task.claimed_by).toBe('test-agent-1');
    expect(claimRes.body.task.lease_expires_at).toBeDefined();
    expect(claimRes.body.agent_run).toBeDefined();
    expect(claimRes.body.agent_run.status).toBe('pending');
    expect(claimRes.body.agent_run.task_id).toBe(taskRes.body.id);
  });

  it('prevents double-claiming of the same task', async () => {
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    // First claim succeeds
    await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'agent-1' })
      .expect(200);

    // Second claim fails
    await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'agent-2' })
      .expect(409);
  });

  it('executes research agent and produces a structured summary with source references', async () => {
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    const claimRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'test-agent' })
      .expect(200);

    const runId = claimRes.body.agent_run.id;

    // Execute the research agent
    const execRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/execute-research`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(execRes.body.artifact_id).toBeDefined();
    expect(execRes.body.summary).toBeDefined();
    expect(execRes.body.summary.company_overview).toBeDefined();
    expect(execRes.body.summary.source_references).toBeDefined();
    expect(execRes.body.summary.source_references[0].artifact_id).toBe(extractedArtifactId);

    // Verify artifact was created
    const artifactRes = await request(app)
      .get(`/artifacts/${execRes.body.artifact_id}`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(artifactRes.body.type).toBe('research_summary');
    expect(artifactRes.body.source_artifact_ids).toContain(extractedArtifactId);
    expect(artifactRes.body.metadata).toBeDefined();
    expect(artifactRes.body.metadata.company_overview).toBeDefined();

    // Verify agent run was updated
    const agentRun = await prisma.agentRun.findUnique({
      where: { id: runId },
    });
    expect(agentRun).not.toBeNull();
    expect(agentRun!.status).toBe('completed');
    expect(agentRun!.output_artifact_id).toBe(execRes.body.artifact_id);
    expect(agentRun!.runtime_seconds).toBeGreaterThan(0);
  });

  it('heartbeat extends the task lease', async () => {
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    const claimRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'test-agent', lease_duration_ms: 10000 })
      .expect(200);

    const originalLease = new Date(claimRes.body.task.lease_expires_at).getTime();

    // Wait a moment, then heartbeat
    await new Promise((r) => setTimeout(r, 100));

    const heartbeatRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/heartbeat`)
      .set(authHeaders(CUSTOMER_1))
      .send({ lease_duration_ms: 30000 })
      .expect(200);

    const newLease = new Date(heartbeatRes.body.lease_expires_at).getTime();
    expect(newLease).toBeGreaterThan(originalLease);
  });

  it('enforces tenant isolation on tasks and agent runs', async () => {
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    // Customer 2 cannot see the task
    await request(app)
      .get(`/tasks/${taskRes.body.id}`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);

    // Customer 2 cannot claim
    await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_2))
      .send({ claimed_by: 'bad-agent' })
      .expect(404);
  });

  it('logs agent run with status, runtime, and cost tracking', async () => {
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extractedArtifactId },
      })
      .expect(201);

    const claimRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'test-agent' })
      .expect(200);

    const runId = claimRes.body.agent_run.id;

    await request(app)
      .post(`/tasks/${taskRes.body.id}/execute-research`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const run = await prisma.agentRun.findUnique({ where: { id: runId } });
    expect(run).not.toBeNull();
    expect(run!.status).toBe('completed');
    expect(run!.runtime_seconds).toBeGreaterThan(0);
    expect(run!.cost_cents).toBe(0); // Deterministic agent has no cost in Slice 2
    expect(run!.agent_type).toBe('research');
    expect(run!.project_id).toBe(projectId);
    expect(run!.customer_id).toBe(CUSTOMER_1);
  });
});