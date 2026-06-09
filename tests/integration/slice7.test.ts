import request from 'supertest';
import { app } from '../../src/server';
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

describe('Slice 7: Suggest Impact and Regenerate', () => {
  let projectId: string;
  let workspaceVersionId: string;
  let summaryArtifactId: string;
  let targetClaimId: string;
  let reviewCommentId: string;

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

    // Extract claims
    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    // Find a management_assertion claim (has rich impact mapping)
    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const targetClaim = claimsRes.body.claims.find((c: any) => c.type === 'management_assertion');
    expect(targetClaim).toBeDefined();
    targetClaimId = targetClaim.id;

    // Submit correction review comment
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
    reviewCommentId = reviewRes.body.id;
  });

  it('suggests affected sections based on invalidated claim type', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/reviews/${reviewCommentId}/impact`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res.body.review_comment_id).toBe(reviewCommentId);
    expect(res.body.invalidated_claim_id).toBe(targetClaimId);
    expect(res.body.claim_type).toBe('management_assertion');

    // management_assertion should affect: company_overview, business_model, revenue_model, executive_summary
    expect(res.body.suggested_sections).toContain('company_overview');
    expect(res.body.suggested_sections).toContain('business_model');
    expect(res.body.suggested_sections).toContain('revenue_model');
    expect(res.body.suggested_sections).toContain('executive_summary');
    expect(res.body.over_invalidate_warning).toBeTruthy();
  });

  it('confirms impact and auto-creates a new version with minimal-delta regeneration task', async () => {
    // Step 1: Get impact suggestions
    const impactRes = await request(app)
      .get(`/projects/${projectId}/reviews/${reviewCommentId}/impact`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const suggestedSections = impactRes.body.suggested_sections;
    expect(suggestedSections.length).toBeGreaterThan(0);

    // Step 2: Confirm a subset of sections (simulating analyst oversight)
    const confirmedSections = ['revenue_model', 'executive_summary'];

    const confirmRes = await request(app)
      .post(`/projects/${projectId}/reviews/${reviewCommentId}/confirm-impact`)
      .set(authHeaders(CUSTOMER_1))
      .send({ confirmed_sections: confirmedSections })
      .expect(201);

    expect(confirmRes.body.review_comment_id).toBe(reviewCommentId);
    expect(confirmRes.body.confirmed_sections).toEqual(confirmedSections);

    // New version should be v3 (v1 created by project, v2 by manual correction in slice 6, v3 by impact confirmation)
    // Actually in this test flow we only have v1 (project creation) + v2 (from confirm-impact)
    const newVersion = confirmRes.body.new_version;
    expect(newVersion.version_number).toBeGreaterThan(1);
    expect(newVersion.parent_version_id).toBeTruthy();

    // Regeneration task should be auto-created with ONLY confirmed sections (minimal delta)
    const task = confirmRes.body.regeneration_task;
    expect(task.type).toBe('regeneration');
    expect(task.capability).toBe('regeneration');
    expect(task.payload.section_names).toEqual(confirmedSections);
    expect(task.payload.review_comment_id).toBe(reviewCommentId);

    // Step 3: Claim and execute the auto-generated regeneration task
    await request(app)
      .post(`/tasks/${task.id}/claim`)
      .set(authHeaders(CUSTOMER_1))
      .send({ claimed_by: 'regen-agent' })
      .expect(200);

    const execRes = await request(app)
      .post(`/tasks/${task.id}/execute-regeneration`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(execRes.body.artifact_id).toBeDefined();
    expect(execRes.body.lineage.regenerated_sections).toEqual(confirmedSections);
    expect(execRes.body.lineage.review_comment_id).toBe(reviewCommentId);
    expect(execRes.body.lineage.invalidated_claim_ids).toContain(targetClaimId);

    // Verify the artifact is in the new version with minimal-delta lineage
    const artifactsRes = await request(app)
      .get(`/projects/${projectId}/artifacts`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    // The /artifacts endpoint returns artifacts from the CURRENT version (v1)
    // The new artifact is in v2 or v3, so we verify via database
    const artifact = await (await import('../../src/lib/prisma')).prisma.artifact.findFirst({
      where: {
        id: execRes.body.artifact_id,
        project_id: projectId,
        customer_id: CUSTOMER_1,
        workspace_version_id: newVersion.id,
      },
    });

    expect(artifact).toBeTruthy();
    const metadata = artifact!.metadata as any;
    expect(metadata.lineage.regenerated_sections).toEqual(confirmedSections);
    // Minimal delta: only confirmed sections were regenerated
    expect(metadata.lineage.regenerated_sections.length).toBe(confirmedSections.length);
  });

  it('over-invalidates by including executive_summary for all claim types', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/reviews/${reviewCommentId}/impact`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res.body.suggested_sections).toContain('executive_summary');
  });

  it('rejects impact confirmation with empty sections', async () => {
    // First analyze impact
    await request(app)
      .get(`/projects/${projectId}/reviews/${reviewCommentId}/impact`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    // Then try to confirm with empty sections
    await request(app)
      .post(`/projects/${projectId}/reviews/${reviewCommentId}/confirm-impact`)
      .set(authHeaders(CUSTOMER_1))
      .send({ confirmed_sections: [] })
      .expect(400);
  });

  it('enforces tenant isolation on impact analysis and confirmation', async () => {
    await request(app)
      .get(`/projects/${projectId}/reviews/${reviewCommentId}/impact`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);

    await request(app)
      .post(`/projects/${projectId}/reviews/${reviewCommentId}/confirm-impact`)
      .set(authHeaders(CUSTOMER_2))
      .send({ confirmed_sections: ['revenue_model'] })
      .expect(404);
  });
});
