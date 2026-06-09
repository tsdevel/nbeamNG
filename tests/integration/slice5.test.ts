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

describe('Slice 5: Verify Claims and Detect Contradictions', () => {
  let projectId: string;
  let summaryArtifactId: string;
  let workspaceVersionId: string;

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

    const claimRes = await request(app)
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
  });

  it('verifies claims and marks supported claims without contradictions', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/verify-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res.body.claims_verified).toBeGreaterThan(0);

    // Without conflicting claims, all should be supported
    // (every claim has evidence and no same-type duplicates with different text)
    for (const claim of res.body.claims) {
      expect(claim.status).toBe('supported');
      expect(claim.metadata.confidence).toBeDefined();
      expect(claim.metadata.confidence.conflict_status).toBe('no_known_conflict');
      expect(claim.metadata.confidence.human_review).toBe('pending');
      expect(claim.metadata.verification_result.has_evidence).toBe(true);
    }
  });

  it('detects contradictions between claims of the same type with different text', async () => {
    // Manually create two conflicting financial_fact claims
    // (dummy.pdf does not generate financial_fact claims)
    await prisma.claim.create({
      data: {
        project_id: projectId,
        customer_id: CUSTOMER_1,
        workspace_version_id: workspaceVersionId,
        artifact_id: summaryArtifactId,
        type: 'financial_fact',
        text: 'Revenue was $50M',
        status: 'draft',
        source_reliability: 'management_assertion',
      },
    });

    await prisma.claim.create({
      data: {
        project_id: projectId,
        customer_id: CUSTOMER_1,
        workspace_version_id: workspaceVersionId,
        artifact_id: summaryArtifactId,
        type: 'financial_fact',
        text: 'Revenue was $100M (conflicting figure)',
        status: 'draft',
        source_reliability: 'management_assertion',
      },
    });

    // Verify claims
    const res = await request(app)
      .post(`/projects/${projectId}/verify-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const financialClaims = res.body.claims.filter(
      (c: any) => c.type === 'financial_fact'
    );
    expect(financialClaims.length).toBeGreaterThanOrEqual(2);

    for (const claim of financialClaims) {
      expect(claim.status).toBe('needs_review');
      expect(claim.metadata.confidence.conflict_status).toBe('conflict_detected');
      expect(claim.metadata.verification_result.has_contradictions).toBe(true);
    }

    expect(res.body.needs_review).toBeGreaterThanOrEqual(2);
  });

  it('flags unsupported claims (claims with no evidence)', async () => {
    // Create a claim with no evidence
    const unsupportedClaim = await prisma.claim.create({
      data: {
        project_id: projectId,
        customer_id: CUSTOMER_1,
        workspace_version_id: workspaceVersionId,
        artifact_id: summaryArtifactId,
        type: 'market_fact',
        text: 'TAM is $10B (no evidence provided)',
        status: 'draft',
        source_reliability: 'unverified',
      },
    });

    const res = await request(app)
      .post(`/projects/${projectId}/verify-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const found = res.body.claims.find((c: any) => c.id === unsupportedClaim.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('needs_review');
    expect(found.metadata.verification_result.has_evidence).toBe(false);
  });

  it('structures confidence metadata with all required dimensions', async () => {
    await request(app)
      .post(`/projects/${projectId}/verify-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    for (const claim of claimsRes.body.claims) {
      expect(claim.metadata.confidence).toMatchObject({
        evidence_type: expect.any(String),
        source_reliability: expect.any(String),
        extraction_certainty: 'high',
        calculation_status: 'not_applicable',
        conflict_status: expect.any(String),
        human_review: 'pending',
      });
    }
  });

  it('enforces tenant isolation on verification', async () => {
    await request(app)
      .post(`/projects/${projectId}/verify-claims`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);
  });
});