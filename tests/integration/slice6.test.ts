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

describe('Slice 6: Apply Human Corrections', () => {
  let projectId: string;
  let workspaceVersionId: string;
  let summaryArtifactId: string;
  let targetClaimId: string;

  beforeEach(async () => {
    // Create project
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

    // Upload PDF
    const pdfBuffer = createTestPdf();
    const base64 = pdfBuffer.toString('base64');

    await request(app)
      .post(`/projects/${projectId}/upload`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        file_name: 'CIM_AcmeCorp.pdf',
        mime_type: 'application/pdf',
        file_content: base64,
      })
      .expect(201);

    // Get extracted artifact
    const artifactsRes = await request(app)
      .get(`/projects/${projectId}/artifacts`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const extracted = artifactsRes.body.artifacts.find((a: any) => a.type === 'extracted_text');
    expect(extracted).toBeDefined();
    workspaceVersionId = extracted.workspace_version_id;

    // Run research agent
    const taskRes = await request(app)
      .post(`/projects/${projectId}/tasks`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'research',
        capability: 'research',
        payload: { artifact_id: extracted.id },
      })
      .expect(201);

    await request(app)
      .post(`/tasks/${taskRes.body.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'test-agent' })
      .expect(200);

    const execRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/execute-research`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    summaryArtifactId = execRes.body.artifact_id;
    expect(summaryArtifactId).toBeDefined();

    // Extract claims
    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    // Find a target claim
    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const targetClaim = claimsRes.body.claims.find((c: any) => c.type === 'management_assertion');
    expect(targetClaim).toBeDefined();
    targetClaimId = targetClaim.id;
  });

  it('submits a correction review comment and invalidates the target claim', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        workspace_version_id: workspaceVersionId,
        type: 'correction',
        text: 'Revenue is $50M, not $30M',
        target_claim_id: targetClaimId,
      })
      .expect(201);

    expect(res.body.type).toBe('correction');
    expect(res.body.text).toBe('Revenue is $50M, not $30M');
    expect(res.body.target_claim_id).toBe(targetClaimId);

    // Verify claim is invalidated
    const claimRes = await request(app)
      .get(`/claims/${targetClaimId}`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(claimRes.body.status).toBe('invalidated');
    expect(claimRes.body.invalidated_by_comment_id).toBe(res.body.id);
  });

  it('creates an immutable workspace version v2 from v1', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/workspace-versions`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        parent_version_id: workspaceVersionId,
      })
      .expect(201);

    expect(res.body.version_number).toBe(2);
    expect(res.body.parent_version_id).toBe(workspaceVersionId);
    expect(res.body.project_id).toBe(projectId);

    // Verify listing includes both versions
    const listRes = await request(app)
      .get(`/projects/${projectId}/workspace-versions`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(listRes.body.versions).toHaveLength(2);
    expect(listRes.body.versions[0].version_number).toBe(1);
    expect(listRes.body.versions[1].version_number).toBe(2);
  });

  it('creates a regeneration task and produces a corrected artifact in v2', async () => {
    // Step 1: Submit correction
    const reviewRes = await request(app)
      .post(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        workspace_version_id: workspaceVersionId,
        type: 'correction',
        text: 'Revenue is $50M, not $30M',
        target_claim_id: targetClaimId,
      })
      .expect(201);

    // Step 2: Create v2
    const versionRes = await request(app)
      .post(`/projects/${projectId}/workspace-versions`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        parent_version_id: workspaceVersionId,
      })
      .expect(201);
    const v2Id = versionRes.body.id;

    // Step 3: Create regeneration task
    const regenRes = await request(app)
      .post(`/projects/${projectId}/regenerate`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        version_id: v2Id,
        section_names: ['revenue_model'],
        review_comment_id: reviewRes.body.id,
      })
      .expect(201);

    expect(regenRes.body.type).toBe('regeneration');
    expect(regenRes.body.capability).toBe('regeneration');
    expect(regenRes.body.payload.version_id).toBe(v2Id);
    expect(regenRes.body.payload.section_names).toEqual(['revenue_model']);

    // Step 4: Claim and execute regeneration task
    const taskId = regenRes.body.id;

    await request(app)
      .post(`/tasks/${taskId}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'regen-agent' })
      .expect(200);

    const execRes = await request(app)
      .post(`/tasks/${taskId}/execute-regeneration`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(execRes.body.artifact_id).toBeDefined();
    expect(execRes.body.lineage.review_comment_id).toBe(reviewRes.body.id);
    expect(execRes.body.lineage.invalidated_claim_ids).toContain(targetClaimId);
    expect(execRes.body.lineage.regenerated_sections).toEqual(['revenue_model']);

    // Step 5: Verify artifact exists in v2 with lineage
    const artifactsRes = await request(app)
      .get(`/projects/${projectId}/artifacts`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    // The artifacts endpoint returns artifacts from the CURRENT workspace version (v1)
    // We need to verify the artifact is in v2 by querying directly or using a different endpoint
    const artifact = await prisma.artifact.findFirst({
      where: {
        id: execRes.body.artifact_id,
        project_id: projectId,
        customer_id: CUSTOMER_1,
        workspace_version_id: v2Id,
      },
    });

    expect(artifact).toBeTruthy();
    expect(artifact!.type).toBe('research_summary');
    expect(artifact!.workspace_version_id).toBe(v2Id);

    const metadata = artifact!.metadata as any;
    expect(metadata.lineage.review_comment_id).toBe(reviewRes.body.id);
    expect(metadata.lineage.invalidated_claim_ids).toContain(targetClaimId);
    expect(metadata.lineage.regenerated_sections).toEqual(['revenue_model']);
    expect(metadata.lineage.parent_version_id).toBe(workspaceVersionId);
  });

  it('lists review comments with target claim and invalidated claims', async () => {
    const reviewRes = await request(app)
      .post(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        workspace_version_id: workspaceVersionId,
        type: 'correction',
        text: 'Revenue is $50M, not $30M',
        target_claim_id: targetClaimId,
      })
      .expect(201);

    const listRes = await request(app)
      .get(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(listRes.body.reviews).toHaveLength(1);
    expect(listRes.body.reviews[0].type).toBe('correction');
    expect(listRes.body.reviews[0].target_claim.id).toBe(targetClaimId);
    expect(listRes.body.reviews[0].invalidated_claims).toHaveLength(1);
    expect(listRes.body.reviews[0].invalidated_claims[0].id).toBe(targetClaimId);
  });

  it('enforces tenant isolation on reviews and workspace versions', async () => {
    // Create review as customer 1
    const reviewRes = await request(app)
      .post(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        workspace_version_id: workspaceVersionId,
        type: 'question',
        text: 'What about the debt structure?',
      })
      .expect(201);

    // Customer 2 cannot list reviews
    const listRes = await request(app)
      .get(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_2))
      .expect(200);
    expect(listRes.body.reviews).toHaveLength(0);

    // Customer 2 cannot create version
    await request(app)
      .post(`/projects/${projectId}/workspace-versions`)
      .set(authHeaders(CUSTOMER_2))
      .send({ parent_version_id: workspaceVersionId })
      .expect(404);

    // Customer 2 cannot create regeneration task
    await request(app)
      .post(`/projects/${projectId}/regenerate`)
      .set(authHeaders(CUSTOMER_2))
      .send({
        version_id: workspaceVersionId,
        section_names: ['revenue_model'],
        review_comment_id: reviewRes.body.id,
      })
      .expect(404);
  });
});
