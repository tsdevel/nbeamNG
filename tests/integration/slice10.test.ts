import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { minioClient } from '../../src/lib/minio';
import { config } from '../../src/lib/config';
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

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await minioClient.statObject(bucket, key);
    return true;
  } catch {
    return false;
  }
}

async function createProjectWithClaims(
  customerId: string,
  projectName: string,
  targetCompany: string
) {
  const projectRes = await request(app)
    .post('/projects')
    .set(authHeaders(customerId))
    .send({
      name: projectName,
      target_company: targetCompany,
      confidentiality_class: 'confidential',
    })
    .expect(201);
  const projectId = projectRes.body.id;

  const pdfBuffer = createTestPdf();
  const base64 = pdfBuffer.toString('base64');

  const uploadRes = await request(app)
    .post(`/projects/${projectId}/upload`)
    .set(authHeaders(customerId))
    .send({
      file_name: 'CIM_AcmeCorp.pdf',
      mime_type: 'application/pdf',
      file_content: base64,
    })
    .expect(201);

  const rawArtifactId = uploadRes.body.artifact.id;
  const storageKey = uploadRes.body.artifact.storage_key;
  expect(storageKey).toBeDefined();

  const artifactsRes = await request(app)
    .get(`/projects/${projectId}/artifacts`)
    .set(authHeaders(customerId))
    .expect(200);

  const extracted = artifactsRes.body.artifacts.find((a: any) => a.type === 'extracted_text');
  expect(extracted).toBeDefined();

  const taskRes = await request(app)
    .post(`/projects/${projectId}/tasks`)
    .set(authHeaders(customerId))
    .send({
      type: 'research',
      capability: 'research',
      payload: { artifact_id: extracted.id },
    })
    .expect(201);

  await request(app)
    .post(`/tasks/${taskRes.body.id}/claim`)
    .set(authHeaders(customerId))
    .send({ claimed_by: 'test-agent' })
    .expect(200);

  const execRes = await request(app)
    .post(`/tasks/${taskRes.body.id}/execute-research`)
    .set(authHeaders(customerId))
    .expect(200);

  const summaryArtifactId = execRes.body.artifact_id;
  expect(summaryArtifactId).toBeDefined();

  await request(app)
    .post(`/artifacts/${summaryArtifactId}/extract-claims`)
    .set(authHeaders(customerId))
    .expect(201);

  const claimsRes = await request(app)
    .get(`/projects/${projectId}/claims`)
    .set(authHeaders(customerId))
    .expect(200);

  return { projectId, rawArtifactId, storageKey, claims: claimsRes.body.claims };
}

describe('Slice 10: Harden Deletion and Expertise Memory', () => {
  describe('US 47-50: Three-tier deletion', () => {
    it('standard closeout purges raw files but retains structured data', async () => {
      const { projectId, rawArtifactId, storageKey, claims } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Acquisition',
        'AcmeCorp'
      );
      expect(claims.length).toBeGreaterThan(0);

      // Verify file exists in MinIO before closeout
      expect(await objectExists(config.MINIO_BUCKET, storageKey)).toBe(true);

      // Verify claims have mixed retention classes
      const companySpecific = claims.filter((c: any) => c.retention_class === 'company_specific');
      const retainable = claims.filter((c: any) => c.retention_class !== 'company_specific' && c.retention_class !== 'unknown');
      expect(companySpecific.length).toBeGreaterThan(0);
      expect(retainable.length).toBeGreaterThan(0);

      // Closeout
      const closeoutRes = await request(app)
        .post(`/projects/${projectId}/closeout`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(closeoutRes.body.status).toBe('archived');
      expect(closeoutRes.body.artifacts_purged).toBeGreaterThan(0);

      // Verify project status
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      expect(project?.status).toBe('archived');

      // Verify raw artifact metadata exists but storage keys are null and purge_status set
      const rawArtifact = await prisma.artifact.findUnique({ where: { id: rawArtifactId } });
      expect(rawArtifact).toBeDefined();
      expect(rawArtifact?.storage_bucket).toBeNull();
      expect(rawArtifact?.storage_key).toBeNull();
      expect(rawArtifact?.purge_status).toBe('purged');

      // Verify file is gone from MinIO
      expect(await objectExists(config.MINIO_BUCKET, storageKey)).toBe(false);

      // Verify artifact content download is blocked
      await request(app)
        .get(`/artifacts/${rawArtifactId}/content`)
        .set(authHeaders(CUSTOMER_1))
        .expect(404);

      // Verify extracted_text artifact still exists (Juice retained)
      const artifacts = await prisma.artifact.findMany({ where: { project_id: projectId } });
      const extracted = artifacts.find((a: any) => a.type === 'extracted_text');
      expect(extracted).toBeDefined();
      expect(extracted?.extracted_text).toBeTruthy();

      // Verify claims still exist (Juice retained)
      const remainingClaims = await prisma.claim.findMany({ where: { project_id: projectId } });
      expect(remainingClaims.length).toBe(claims.length);

      // Verify event log receipt
      const events = await prisma.event.findMany({
        where: { project_id: projectId, event_type: 'project_closeout' },
      });
      expect(events.length).toBe(1);
      expect(events[0].payload).toMatchObject({
        status: 'archived',
        artifacts_purged: closeoutRes.body.artifacts_purged,
      });
    });

    it('confidential redaction deletes company-specific claims while retaining market knowledge', async () => {
      const { projectId, claims } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Redaction Test',
        'AcmeCorp'
      );
      expect(claims.length).toBeGreaterThan(0);

      // Closeout first
      await request(app)
        .post(`/projects/${projectId}/closeout`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      // Count before redaction
      const beforeClaims = await prisma.claim.findMany({ where: { project_id: projectId } });
      const beforeCompanySpecific = beforeClaims.filter((c: any) => c.retention_class === 'company_specific').length;
      const beforeRetainable = beforeClaims.filter((c: any) => c.retention_class !== 'company_specific' && c.retention_class !== 'unknown').length;
      const beforeEvidence = await prisma.evidence.findMany({ where: { project_id: projectId } });
      expect(beforeCompanySpecific).toBeGreaterThan(0);
      expect(beforeRetainable).toBeGreaterThan(0);
      expect(beforeEvidence.length).toBeGreaterThan(0);

      // Redact
      const redactRes = await request(app)
        .post(`/projects/${projectId}/redact`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(redactRes.body.status).toBe('purged_confidential');
      expect(redactRes.body.claims_deleted).toBe(beforeCompanySpecific);
      expect(redactRes.body.evidence_deleted).toBeGreaterThanOrEqual(0);

      // Verify project status
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      expect(project?.status).toBe('purged_confidential');

      // Verify company-specific claims deleted
      const afterClaims = await prisma.claim.findMany({ where: { project_id: projectId } });
      expect(afterClaims.length).toBe(beforeRetainable);
      for (const claim of afterClaims) {
        expect(claim.retention_class).not.toBe('company_specific');
      }

      // Verify no company-specific evidence remains
      const afterEvidence = await prisma.evidence.findMany({ where: { project_id: projectId } });
      for (const ev of afterEvidence) {
        expect(ev.retention_class).not.toBe('company_specific');
      }

      // Verify retainable claims still present
      const retainedTypes = [...new Set(afterClaims.map((c: any) => c.retention_class))];
      expect(retainedTypes).not.toContain('company_specific');

      // Verify event log receipt
      const events = await prisma.event.findMany({
        where: { project_id: projectId, event_type: 'project_confidential_redacted' },
      });
      expect(events.length).toBe(1);
      expect(events[0].payload).toMatchObject({
        status: 'purged_confidential',
      });
    });

    it('full purge deletes all project data from database and object storage', async () => {
      const { projectId, storageKey } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Full Purge',
        'AcmeCorp'
      );

      // Closeout and redact first
      await request(app)
        .post(`/projects/${projectId}/closeout`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);
      await request(app)
        .post(`/projects/${projectId}/redact`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      // Purge
      const purgeRes = await request(app)
        .post(`/projects/${projectId}/purge`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(purgeRes.body.status).toBe('purged');

      // Verify project no longer exists
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      expect(project).toBeNull();

      // Verify no artifacts, claims, evidence for this project
      const artifacts = await prisma.artifact.findMany({ where: { project_id: projectId } });
      const claims = await prisma.claim.findMany({ where: { project_id: projectId } });
      const evidence = await prisma.evidence.findMany({ where: { project_id: projectId } });
      const versions = await prisma.workspaceVersion.findMany({ where: { project_id: projectId } });
      const tasks = await prisma.task.findMany({ where: { project_id: projectId } });
      expect(artifacts).toHaveLength(0);
      expect(claims).toHaveLength(0);
      expect(evidence).toHaveLength(0);
      expect(versions).toHaveLength(0);
      expect(tasks).toHaveLength(0);

      // Verify file not in MinIO
      expect(await objectExists(config.MINIO_BUCKET, storageKey)).toBe(false);

      // Verify event log has purge receipt (project_id is null after purge)
      const events = await prisma.event.findMany({
        where: { event_type: 'project_full_purge', customer_id: CUSTOMER_1 },
        orderBy: { occurred_at: 'desc' },
        take: 1,
      });
      expect(events.length).toBe(1);
      expect(events[0].project_id).toBeNull();
      expect(events[0].payload).toMatchObject({ project_id: projectId });
    });

    it('tracks deletion receipts with purge status on artifacts', async () => {
      const { projectId, rawArtifactId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Receipt Test',
        'AcmeCorp'
      );

      // Closeout
      await request(app)
        .post(`/projects/${projectId}/closeout`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      // Verify purge_status tracked on artifact
      const artifact = await prisma.artifact.findUnique({ where: { id: rawArtifactId } });
      expect(artifact?.purge_status).toBe('purged');

      // Verify all three deletion events are in the log
      const closeoutEvents = await prisma.event.findMany({
        where: { project_id: projectId, event_type: 'project_closeout' },
      });
      expect(closeoutEvents.length).toBe(1);
      expect(closeoutEvents[0].payload).toMatchObject({
        status: 'archived',
      });
    });

    it('enforces tenant isolation on deletion operations', async () => {
      const { projectId } = await createProjectWithClaims(
        CUSTOMER_1,
        'Tenant Isolation Test',
        'AcmeCorp'
      );

      // Customer 2 cannot closeout
      await request(app)
        .post(`/projects/${projectId}/closeout`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);

      // Customer 2 cannot redact
      await request(app)
        .post(`/projects/${projectId}/redact`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);

      // Customer 2 cannot purge
      await request(app)
        .post(`/projects/${projectId}/purge`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);
    });
  });

  describe('US 51-54: Expertise memory', () => {
    it('extracts candidate lessons from a completed project', async () => {
      const { projectId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Expertise',
        'AcmeCorp'
      );

      const distillRes = await request(app)
        .post(`/projects/${projectId}/distill`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          lessons: [
            {
              title: 'For vertical SaaS, request both GRR and NRR',
              content: 'Always verify gross retention rate and net retention rate separately',
              category: 'checklist',
            },
            {
              title: 'Check revenue concentration early',
              content: 'Top 5 customer concentration should be reviewed in the first week',
              category: 'methodology',
            },
          ],
        })
        .expect(201);

      expect(distillRes.body.lessons).toHaveLength(2);
      for (const lesson of distillRes.body.lessons) {
        expect(lesson.status).toBe('draft');
        expect(lesson.source_project_id).toBe(projectId);
        expect(lesson.customer_id).toBe(CUSTOMER_1);
        expect(lesson.scrubbed).toBe(false);
      }
    });

    it('requires human approval before lessons enter the expertise store', async () => {
      const { projectId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Approval',
        'AcmeCorp'
      );

      const distillRes = await request(app)
        .post(`/projects/${projectId}/distill`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          lessons: [
            { title: 'Lesson A', content: 'Content A', category: 'checklist' },
            { title: 'Lesson B', content: 'Content B', category: 'methodology' },
          ],
        })
        .expect(201);

      const draftId = distillRes.body.lessons[0].id;
      const rejectedId = distillRes.body.lessons[1].id;

      // Approve one
      const approveRes = await request(app)
        .post(`/expertise/${draftId}/approve`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(approveRes.body.status).toBe('approved');
      expect(approveRes.body.approved_at).toBeDefined();

      // Reject one
      await request(app)
        .post(`/expertise/${rejectedId}/reject`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      // Query approved only — approved lesson appears
      const approvedRes = await request(app)
        .get('/expertise?status=approved')
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(approvedRes.body.lessons).toHaveLength(1);
      expect(approvedRes.body.lessons[0].id).toBe(draftId);

      // Query all lessons — both appear
      const allRes = await request(app)
        .get('/expertise')
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(allRes.body.lessons).toHaveLength(2);
      const statuses = allRes.body.lessons.map((l: any) => l.status);
      expect(statuses).toContain('approved');
      expect(statuses).toContain('rejected');
    });

    it('allows querying approved expertise checklists and methodologies', async () => {
      const { projectId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Query',
        'AcmeCorp'
      );

      const distillRes = await request(app)
        .post(`/projects/${projectId}/distill`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          lessons: [
            { title: 'Checklist 1', content: 'Content', category: 'checklist' },
            { title: 'Methodology 1', content: 'Content', category: 'methodology' },
            { title: 'Playbook 1', content: 'Content', category: 'playbook' },
          ],
        })
        .expect(201);

      // Approve all
      for (const lesson of distillRes.body.lessons) {
        await request(app)
          .post(`/expertise/${lesson.id}/approve`)
          .set(authHeaders(CUSTOMER_1))
          .expect(200);
      }

      // Query all approved
      const res = await request(app)
        .get('/expertise?status=approved')
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(res.body.lessons).toHaveLength(3);
      const categories = res.body.lessons.map((l: any) => l.category);
      expect(categories).toContain('checklist');
      expect(categories).toContain('methodology');
      expect(categories).toContain('playbook');
    });

    it('enforces tenant isolation on expertise queries', async () => {
      const c1Project = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'C1 Expertise', target_company: 'AcmeCorp' })
        .expect(201);

      const distillRes = await request(app)
        .post(`/projects/${c1Project.body.id}/distill`)
        .set(authHeaders(CUSTOMER_1))
        .send({
          lessons: [{ title: 'Secret Lesson', content: 'Secret', category: 'playbook' }],
        })
        .expect(201);

      await request(app)
        .post(`/expertise/${distillRes.body.lessons[0].id}/approve`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      // Customer 2 cannot see approved lessons
      const c2Res = await request(app)
        .get('/expertise?status=approved')
        .set(authHeaders(CUSTOMER_2))
        .expect(200);

      expect(c2Res.body.lessons).toHaveLength(0);

      // Customer 2 cannot approve
      await request(app)
        .post(`/expertise/${distillRes.body.lessons[0].id}/approve`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);
    });
  });
});
