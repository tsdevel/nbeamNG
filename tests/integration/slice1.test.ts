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

describe('Slice 1: Ingest a Deal', () => {
  describe('Project creation', () => {
    it('creates a project with confidentiality class and auto-creates workspace v1', async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'AcmeCorp Acquisition',
          target_company: 'AcmeCorp',
          description: 'Initial due diligence',
          confidentiality_class: 'confidential',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'AcmeCorp Acquisition',
        target_company: 'AcmeCorp',
        confidentiality_class: 'confidential',
        status: 'active',
        customer_id: CUSTOMER_1,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.created_at).toBeDefined();

      // Verify workspace version 1 was auto-created
      const versions = await prisma.workspaceVersion.findMany({
        where: { project_id: res.body.id },
      });
      expect(versions).toHaveLength(1);
      expect(versions[0].version_number).toBe(1);
    });

    it('lists projects scoped to the customer', async () => {
      await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'Project A' })
        .expect(201);

      await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_2))
        .send({ name: 'Project B' })
        .expect(201);

      const res = await request(app)
        .get('/projects')
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(res.body.projects).toHaveLength(1);
      expect(res.body.projects[0].name).toBe('Project A');
    });

    it('returns 404 when accessing another customers project', async () => {
      const createRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'Secret Project' })
        .expect(201);

      await request(app)
        .get(`/projects/${createRes.body.id}`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);
    });
  });

  describe('File upload and ingestion', () => {
    let projectId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'AcmeCorp Acquisition',
          target_company: 'AcmeCorp',
          confidentiality_class: 'confidential',
        });
      projectId = res.body.id;
    });

    it('uploads a PDF, stores in object storage, and creates artifact metadata', async () => {
      const pdfBuffer = createTestPdf('Revenue for FY2024 was $50M.');
      const base64 = pdfBuffer.toString('base64');

      const res = await request(app)
        .post(`/projects/${projectId}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'CIM_AcmeCorp.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      expect(res.body.is_duplicate).toBe(false);
      expect(res.body.artifact).toMatchObject({
        project_id: projectId,
        type: 'raw_upload',
        name: 'CIM_AcmeCorp.pdf',
        mime_type: 'application/pdf',
        status: 'draft',
      });
      expect(res.body.artifact.file_hash).toBeDefined();
      expect(res.body.artifact.storage_bucket).toBeDefined();
      expect(res.body.artifact.storage_key).toBeDefined();
      expect(res.body.artifact.id).toBeDefined();

      // Ingestion should have auto-triggered
      expect(res.body.ingestion).not.toBeNull();
      expect(res.body.ingestion.extractedText).toContain('Dummy PDF file');
      expect(res.body.ingestion.pageCount).toBeGreaterThanOrEqual(1);
    });

    it('creates an extracted_text artifact linked to the raw upload', async () => {
      const pdfBuffer = createTestPdf('Extracted text test content.');
      const base64 = pdfBuffer.toString('base64');

      await request(app)
        .post(`/projects/${projectId}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'test.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      // List artifacts in current workspace version
      const res = await request(app)
        .get(`/projects/${projectId}/artifacts`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(res.body.artifacts).toHaveLength(2);

      const raw = res.body.artifacts.find((a: any) => a.type === 'raw_upload');
      const extracted = res.body.artifacts.find((a: any) => a.type === 'extracted_text');

      expect(raw).toBeDefined();
      expect(extracted).toBeDefined();
      expect(extracted.source_artifact_ids).toContain(raw.id);
      expect(extracted.extracted_text).toContain('Dummy PDF file');
    });

    it('is idempotent — uploading the same file twice returns the existing artifact', async () => {
      const pdfBuffer = createTestPdf('Idempotency test.');
      const base64 = pdfBuffer.toString('base64');

      const first = await request(app)
        .post(`/projects/${projectId}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'same.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      expect(first.body.is_duplicate).toBe(false);

      const second = await request(app)
        .post(`/projects/${projectId}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'same.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      expect(second.body.is_duplicate).toBe(true);
      expect(second.body.artifact.id).toBe(first.body.artifact.id);
      expect(second.body.ingestion).toBeNull(); // No re-ingestion on duplicate
    });

    it('returns artifact content as downloadable file', async () => {
      const pdfBuffer = createTestPdf('Download test.');
      const base64 = pdfBuffer.toString('base64');

      const uploadRes = await request(app)
        .post(`/projects/${projectId}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'download.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      const artifactId = uploadRes.body.artifact.id;

      const res = await request(app)
        .get(`/artifacts/${artifactId}/content`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(Buffer.isBuffer(res.body)).toBe(true);
    });

    it('enforces tenant isolation on upload and artifact access', async () => {
      const pdfBuffer = createTestPdf('Tenant isolation test.');
      const base64 = pdfBuffer.toString('base64');

      const uploadRes = await request(app)
        .post(`/projects/${projectId}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'isolated.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      // Customer 2 cannot access the artifact
      await request(app)
        .get(`/artifacts/${uploadRes.body.artifact.id}`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);

      // Customer 2 cannot download content
      await request(app)
        .get(`/artifacts/${uploadRes.body.artifact.id}/content`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);
    });
  });

  describe('Event log', () => {
    it('records append-only events for material state changes', async () => {
      const pdfBuffer = createTestPdf('Event log test.');
      const base64 = pdfBuffer.toString('base64');

      const projectRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'Event Test' })
        .expect(201);

      await request(app)
        .post(`/projects/${projectRes.body.id}/upload`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          file_name: 'event.pdf',
          mime_type: 'application/pdf',
          file_content: base64,
        })
        .expect(201);

      const events = await prisma.event.findMany({
        where: { customer_id: CUSTOMER_1 },
        orderBy: { occurred_at: 'asc' },
      });

      expect(events.length).toBeGreaterThanOrEqual(2);

      const projectEvent = events.find((e) => e.event_type === 'project_created');
      const uploadEvent = events.find((e) => e.event_type === 'artifact_uploaded');

      expect(projectEvent).toBeDefined();
      expect(projectEvent?.tenant_id).toBe(CUSTOMER_1);
      expect(uploadEvent).toBeDefined();
      expect(uploadEvent?.payload).toMatchObject({
        project_id: projectRes.body.id,
      });
    });
  });
});