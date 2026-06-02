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

describe('Slice 4: Govern Material Claims', () => {
  let projectId: string;
  let summaryArtifactId: string;

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

    await request(app)
      .post(`/projects/${projectId}/upload`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        file_name: 'CIM_AcmeCorp.pdf',
        mime_type: 'application/pdf',
        file_content: base64,
      })
      .expect(201);

    // Execute research agent to produce summary
    const artifactsRes = await request(app)
      .get(`/projects/${projectId}/artifacts`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const extracted = artifactsRes.body.artifacts.find((a: any) => a.type === 'extracted_text');
    expect(extracted).toBeDefined();

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
    expect(summaryArtifactId).toBeDefined();
  });

  it('extracts typed claims from a research summary artifact', async () => {
    const res = await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    expect(res.body.claims_created).toBeGreaterThan(0);
    expect(res.body.evidence_created).toBe(res.body.claims_created);
    expect(res.body.artifact_id).toBe(summaryArtifactId);

    // Verify claims have the constrained taxonomy types
    const types = res.body.claims.map((c: any) => c.type);
    expect(types).toContain('management_assertion');
    expect(types).toContain('risk');
    expect(types).toContain('analyst_judgment');
  });

  it('creates evidence items linked to source artifact for each claim', async () => {
    const extractRes = await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    // Get claims for the project
    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(claimsRes.body.claims.length).toBeGreaterThan(0);

    for (const claim of claimsRes.body.claims) {
      expect(claim.evidence).toBeDefined();
      expect(claim.evidence.length).toBeGreaterThan(0);

      const ev = claim.evidence[0];
      expect(ev.artifact_id).toBe(summaryArtifactId);
      expect(ev.claim_id).toBe(claim.id);
      expect(ev.content).toBeTruthy();
    }
  });

  it('records source coordinates on claims and evidence', async () => {
    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const claim = claimsRes.body.claims[0];
    expect(claim.source_coordinates).toBeDefined();
    expect(claim.source_coordinates.artifact_id).toBe(summaryArtifactId);
    expect(claim.source_coordinates.section).toBe(claim.type);

    const detailRes = await request(app)
      .get(`/claims/${claim.id}`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(detailRes.body.evidence[0].source_coordinates).toBeDefined();
    expect(detailRes.body.evidence[0].source_coordinates.artifact_id).toBe(summaryArtifactId);
  });

  it('sets claim statuses to draft by default', async () => {
    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    for (const claim of claimsRes.body.claims) {
      expect(claim.status).toBe('draft');
    }
  });

  it('enforces tenant isolation on claims and evidence', async () => {
    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(201);

    const claimsRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const claimId = claimsRes.body.claims[0].id;

    // Customer 2 cannot list claims
    const listRes = await request(app)
      .get(`/projects/${projectId}/claims`)
      .set(authHeaders(CUSTOMER_2))
      .expect(200);

    expect(listRes.body.claims).toHaveLength(0);

    // Customer 2 cannot get claim detail
    await request(app)
      .get(`/claims/${claimId}`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);

    // Customer 2 cannot extract claims from Customer 1's artifact
    await request(app)
      .post(`/artifacts/${summaryArtifactId}/extract-claims`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);
  });
});