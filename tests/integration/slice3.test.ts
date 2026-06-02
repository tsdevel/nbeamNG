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

describe('Slice 3: Track and Resolve DataNeeds', () => {
  let projectId: string;
  let extractedArtifactId: string;

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

    const uploadRes = await request(app)
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
    extractedArtifactId = extracted.id;
  });

  it('agent creates DataNeeds when research reveals missing information', async () => {
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

    const execRes = await request(app)
      .post(`/tasks/${taskRes.body.id}/execute-research`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(execRes.body.data_needs).toBeDefined();
    expect(execRes.body.data_needs.length).toBeGreaterThan(0);

    // Verify DataNeed records exist in the database
    const dns = await prisma.dataNeed.findMany({
      where: { project_id: projectId, customer_id: CUSTOMER_1 },
    });

    expect(dns.length).toBeGreaterThan(0);

    const missingInfoDn = dns.find((dn) => dn.type === 'missing_information');
    expect(missingInfoDn).toBeDefined();
    expect(missingInfoDn!.status).toBe('open');
    expect(missingInfoDn!.priority).toBe('high');
    expect(missingInfoDn!.requestor_task_id).toBe(taskRes.body.id);

    const insufficientDn = dns.find((dn) => dn.type === 'insufficient_source');
    expect(insufficientDn).toBeDefined();
    expect(insufficientDn!.status).toBe('open');
  });

  it('lists DataNeeds scoped to project and customer', async () => {
    // Create a DataNeed manually
    await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'competitor_revenue',
        priority: 'high',
        description: 'Competitor X FY2024 revenue is missing',
      })
      .expect(201);

    const res = await request(app)
      .get(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(res.body.data_needs).toHaveLength(1);
    expect(res.body.data_needs[0].type).toBe('competitor_revenue');
    expect(res.body.data_needs[0].status).toBe('open');
  });

  it('filters DataNeeds by status', async () => {
    await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'competitor_revenue',
        priority: 'high',
        description: 'Competitor X FY2024 revenue is missing',
      })
      .expect(201);

    await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'market_size',
        priority: 'medium',
        description: 'TAM estimate needed',
      })
      .expect(201);

    // Resolve competitor_revenue explicitly (ordering is alphabetical by priority string)
    const dns = await request(app)
      .get(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    const competitorDn = dns.body.data_needs.find((dn: any) => dn.type === 'competitor_revenue');
    expect(competitorDn).toBeDefined();

    await request(app)
      .post(`/dataneeds/${competitorDn.id}/resolve`)
      .set(authHeaders(CUSTOMER_1))
      .send({ notes: 'Found in supplementary filing' })
      .expect(200);

    // Filter by open status
    const openRes = await request(app)
      .get(`/projects/${projectId}/dataneeds?status=open`)
      .set(authHeaders(CUSTOMER_1))
      .expect(200);

    expect(openRes.body.data_needs).toHaveLength(1);
    expect(openRes.body.data_needs[0].type).toBe('market_size');
  });

  it('resolves a DataNeed with resolution notes and artifact reference', async () => {
    const createRes = await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'competitor_revenue',
        priority: 'high',
        description: 'Competitor X FY2024 revenue is missing',
      })
      .expect(201);

    const resolveRes = await request(app)
      .post(`/dataneeds/${createRes.body.id}/resolve`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        resolution_artifact_id: extractedArtifactId,
        notes: 'Resolved via supplementary filing',
      })
      .expect(200);

    expect(resolveRes.body.status).toBe('resolved');
    expect(resolveRes.body.resolution_notes).toBe('Resolved via supplementary filing');
    expect(resolveRes.body.resolution_artifact_id).toBe(extractedArtifactId);
  });

  it('marks a DataNeed as unavailable with explanation', async () => {
    const createRes = await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'competitor_revenue',
        priority: 'high',
        description: 'Competitor X FY2024 revenue is missing',
      })
      .expect(201);

    const res = await request(app)
      .post(`/dataneeds/${createRes.body.id}/unavailable`)
      .set(authHeaders(CUSTOMER_1))
      .send({ notes: 'Searched SEC filings, company blog, and press releases — no public figure available.' })
      .expect(200);

    expect(res.body.status).toBe('unavailable');
    expect(res.body.resolution_notes).toContain('SEC filings');
  });

  it('enforces tenant isolation on DataNeeds', async () => {
    const createRes = await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'confidential',
        priority: 'high',
        description: 'Sensitive data gap',
      })
      .expect(201);

    // Customer 2 cannot view
    await request(app)
      .get(`/dataneeds/${createRes.body.id}`)
      .set(authHeaders(CUSTOMER_2))
      .expect(404);

    // Customer 2 cannot resolve
    await request(app)
      .post(`/dataneeds/${createRes.body.id}/resolve`)
      .set(authHeaders(CUSTOMER_2))
      .send({ notes: 'Hacked' })
      .expect(404);

    // Customer 2 cannot list project's DataNeeds
    const listRes = await request(app)
      .get(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_2))
      .expect(200);

    expect(listRes.body.data_needs).toHaveLength(0);
  });

  it('tracks the full lifecycle of a DataNeed: open → resolving → resolved', async () => {
    const createRes = await request(app)
      .post(`/projects/${projectId}/dataneeds`)
      .set(authHeaders(CUSTOMER_1))
      .send({
        type: 'market_size',
        priority: 'medium',
        description: 'TAM estimate needed for FY2024',
      })
      .expect(201);

    expect(createRes.body.status).toBe('open');

    // A research agent could mark it as resolving
    await prisma.dataNeed.update({
      where: { id: createRes.body.id },
      data: { status: 'resolving' },
    });

    const resolving = await prisma.dataNeed.findUnique({
      where: { id: createRes.body.id },
    });
    expect(resolving!.status).toBe('resolving');

    // Human resolves it
    const resolveRes = await request(app)
      .post(`/dataneeds/${createRes.body.id}/resolve`)
      .set(authHeaders(CUSTOMER_1))
      .send({ notes: 'Found TAM of $5B in industry report' })
      .expect(200);

    expect(resolveRes.body.status).toBe('resolved');
  });
});