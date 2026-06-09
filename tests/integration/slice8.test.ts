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

async function resolveAllDataNeeds(projectId: string, customerId: string) {
  const dataNeeds = await prisma.dataNeed.findMany({
    where: { project_id: projectId, customer_id: customerId },
  });
  for (const dn of dataNeeds) {
    await prisma.dataNeed.update({
      where: { id: dn.id },
      data: { status: 'resolved', resolution_notes: 'Resolved for test' },
    });
  }
}

describe('Slice 8: Finalize and Export', () => {
  let projectId: string;
  let workspaceVersionId: string;
  let summaryArtifactId: string;
  let claimId: string;

  beforeEach(async () => {
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

    await request(app)
      .post(`/projects/${projectId}/upload`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        file_name: 'CIM_AcmeCorp.pdf',
        mime_type: 'application/pdf',
        file_content: base64,
      })
      .expect(201);

    const artifactsRes = await request(app)
      .get(`/projects/${projectId}/artifacts`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const extracted = artifactsRes.body.artifacts.find((a: any) => a.type === 'extracted_text');
    expect(extracted).toBeDefined();
    workspaceVersionId = extracted.workspace_version_id;

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

    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    claimId = claimsRes.body.claims[0].id;
  });

  it('blocks finalization when claims are in invalid status', async () => {
    await prisma.claim.update({
      where: { id: claimId },
      data: { status: 'needs_review' },
    });

    const res = await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_1))
      .expect(409);

    expect(res.body.passed).toBe(false);
    expect(res.body.blockers.length).toBeGreaterThan(0);
    expect(res.body.blockers[0]).toContain('invalid status');
    expect(res.body.checks.claims_valid).toBe(false);
    expect(res.body.checks.thesis_complete).toBe(true);
  });

  it('blocks finalization when DataNeeds are unresolved', async () => {
    await prisma.dataNeed.create({
      data: {
        project_id: projectId,
        customer_id: CUSTOMER_1,
        type: 'missing_information',
        priority: 'high',
        description: 'Need competitor revenue data',
        status: 'open',
      },
    });

    const res = await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_1))
      .expect(409);

    expect(res.body.passed).toBe(false);
    expect(res.body.blockers[0]).toContain('unresolved DataNeed');
    expect(res.body.checks.dataneeds_resolved).toBe(false);
  });

  it('blocks finalization when claims are invalidated', async () => {
    await request(app)
      .post(`/projects/${projectId}/reviews`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        workspace_version_id: workspaceVersionId,
        type: 'correction',
        text: 'Revenue is $50M, not $30M',
        target_claim_id: claimId,
      })
      .expect(201);

    const res = await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_1))
      .expect(409);

    expect(res.body.passed).toBe(false);
    expect(res.body.blockers[0]).toContain('invalid status');
  });

  it('finalizes successfully and creates a report artifact with export lineage', async () => {
    await resolveAllDataNeeds(projectId, CUSTOMER_1);

    const res = await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res.body.passed).toBe(true);
    expect(res.body.blockers).toHaveLength(0);
    expect(res.body.checks.claims_valid).toBe(true);
    expect(res.body.checks.dataneeds_resolved).toBe(true);
    expect(res.body.checks.thesis_complete).toBe(true);
    expect(res.body.report_artifact_id).toBeDefined();
    expect(res.body.export_lineage).toBeDefined();
    expect(res.body.export_lineage.claims_count).toBeGreaterThan(0);
    expect(res.body.export_lineage.artifacts_count).toBeGreaterThan(0);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.status).toBe('completed');

    const artifact = await prisma.artifact.findUnique({
      where: { id: res.body.report_artifact_id },
    });
    expect(artifact).toBeTruthy();
    expect(artifact!.type).toBe('report');
    expect(artifact!.name).toContain('IC Report');

    const metadata = artifact!.metadata as any;
    expect(metadata.export_lineage).toBeDefined();
    expect(metadata.export_lineage.workspace_version_id).toBe(workspaceVersionId);
    expect(metadata.export_lineage.claims_used).toBeDefined();
    expect(metadata.export_lineage.claims_used.length).toBeGreaterThan(0);
    expect(metadata.export_lineage.artifacts_used).toBeDefined();

    const hasInvalidated = metadata.export_lineage.claims_used.some(
      (c: any) => c.status === 'invalidated'
    );
    expect(hasInvalidated).toBe(false);
  });

  it('excludes invalidated claims from export lineage', async () => {
    await resolveAllDataNeeds(projectId, CUSTOMER_1);

    // Create a valid claim in the current version
    const validClaim = await prisma.claim.create({
      data: {
        project_id: projectId,
        customer_id: CUSTOMER_1,
        workspace_version_id: workspaceVersionId,
        artifact_id: summaryArtifactId,
        type: 'financial_fact',
        text: 'Revenue was $50M',
        status: 'supported',
        source_reliability: 'management_assertion',
      },
    });

    // First finalization: valid claim is included in lineage
    const res1 = await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res1.body.passed).toBe(true);
    const artifact1 = await prisma.artifact.findUnique({
      where: { id: res1.body.report_artifact_id },
    });
    const metadata1 = artifact1!.metadata as any;
    const validClaimIds1 = metadata1.export_lineage.claims_used.map((c: any) => c.id);
    expect(validClaimIds1).toContain(validClaim.id);

    // Now invalidate the claim
    await prisma.claim.update({
      where: { id: validClaim.id },
      data: { status: 'invalidated' },
    });

    // Second finalization: blocked because invalidated claim exists in current version
    const res2 = await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_1))
      .expect(409);

    expect(res2.body.passed).toBe(false);
    expect(res2.body.blockers[0]).toContain('invalid status');
  });

  it('enforces tenant isolation on finalization', async () => {
    await request(app)
      .post(`/projects/${projectId}/finalize`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);
  });
});
