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

/**
 * Helper: full flow to create a project with claims for a given customer.
 */
async function createProjectWithClaims(
  customerId: string,
  projectName: string,
  targetCompany: string,
  parentProjectId?: string
) {
  // Create project
  const projectRes = await request(app)
    .post('/projects')
    .set(authHeaders(customerId))
    .send({
      name: projectName,
      target_company: targetCompany,
      confidentiality_class: 'confidential',
      parent_project_id: parentProjectId,
    })
    .expect(201);
  const projectId = projectRes.body.id;

  // Upload PDF
  const pdfBuffer = createTestPdf();
  const base64 = pdfBuffer.toString('base64');

  await request(app)
    .post(`/projects/${projectId}/upload`)
    .set(authHeaders(customerId))
    .send({
      file_name: 'CIM_AcmeCorp.pdf',
      mime_type: 'application/pdf',
      file_content: base64,
    })
    .expect(201);

  // Get extracted text artifact
  const artifactsRes = await request(app)
    .get(`/projects/${projectId}/artifacts`)
    .set(authHeaders(customerId))
    .expect(200);

  const extracted = artifactsRes.body.artifacts.find((a: any) => a.type === 'extracted_text');
  expect(extracted).toBeDefined();

  // Create research task
  const taskRes = await request(app)
    .post(`/projects/${projectId}/tasks`)
    .set(authHeaders(customerId))
    .send({
      type: 'research',
      capability: 'research',
      payload: { artifact_id: extracted.id },
    })
    .expect(201);

  // Claim and execute research
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

  // Extract claims
  await request(app)
    .post(`/artifacts/${summaryArtifactId}/extract-claims`)
    .set(authHeaders(customerId))
    .expect(201);

  // Get claims
  const claimsRes = await request(app)
    .get(`/projects/${projectId}/claims`)
    .set(authHeaders(customerId))
    .expect(200);

  return { projectId, claims: claimsRes.body.claims, summaryArtifactId };
}

describe('Slice 9: Longitudinal Dossiers', () => {
  describe('US 43: Linked follow-up projects', () => {
    it('creates a follow-up project linked to a previous analysis and inherits dossier context', async () => {
      // Create parent project
      const parentRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'AcmeCorp Initial DD',
          target_company: 'AcmeCorp',
          confidentiality_class: 'confidential',
        })
        .expect(201);

      const parentId = parentRes.body.id;
      expect(parentRes.body.target_company).toBe('AcmeCorp');
      expect(parentRes.body.dossier_id).toBeDefined();
      expect(parentRes.body.dossier_id).toContain('acmecorp');

      // Create follow-up project linked to parent
      const followupRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'AcmeCorp 6-Month Follow-up',
          parent_project_id: parentId,
          confidentiality_class: 'confidential',
        })
        .expect(201);

      const followupId = followupRes.body.id;
      expect(followupRes.body.parent_project_id).toBe(parentId);
      expect(followupRes.body.dossier_id).toBe(parentRes.body.dossier_id);
      expect(followupRes.body.target_company).toBe('AcmeCorp'); // inherited

      // Verify parent shows child project
      const parentGet = await request(app)
        .get(`/projects/${parentId}`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(parentGet.body.child_projects).toHaveLength(1);
      expect(parentGet.body.child_projects[0].id).toBe(followupId);
      expect(parentGet.body.child_projects[0].name).toBe('AcmeCorp 6-Month Follow-up');
    });

    it('allows explicit dossier_id to override parent inheritance', async () => {
      const parentRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'Parent Project',
          target_company: 'AcmeCorp',
        })
        .expect(201);

      const customDossier = 'custom:dossier:123';
      const followupRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'Follow-up with Custom Dossier',
          parent_project_id: parentRes.body.id,
          dossier_id: customDossier,
          target_company: 'DifferentCorp', // should be kept since explicitly provided
        })
        .expect(201);

      expect(followupRes.body.dossier_id).toBe(customDossier);
      expect(followupRes.body.target_company).toBe('DifferentCorp');
    });

    it('rejects parent_project_id that does not exist or belongs to another tenant', async () => {
      // Create project for customer 1
      const parentRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'Secret', target_company: 'AcmeCorp' })
        .expect(201);

      // Customer 2 cannot link to customer 1's project
      await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_2))
        .send({
          name: 'Follow-up',
          parent_project_id: parentRes.body.id,
        })
        .expect(404);
    });
  });

  describe('US 44: Query dossier historical claims', () => {
    it('returns historical claims from previous projects in the same dossier', async () => {
      const { projectId: parentId, claims: parentClaims } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Initial DD',
        'AcmeCorp'
      );
      expect(parentClaims.length).toBeGreaterThan(0);

      const { projectId: followupId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Follow-up',
        'AcmeCorp',
        parentId
      );

      // Query dossier from follow-up project
      const dossierRes = await request(app)
        .get(`/projects/${followupId}/dossier`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(dossierRes.body.dossier_id).toBeDefined();
      expect(dossierRes.body.claims.length).toBeGreaterThanOrEqual(parentClaims.length);

      // Claims should include project context
      const parentClaimTexts = parentClaims.map((c: any) => c.text);
      for (const claim of dossierRes.body.claims) {
        expect(claim.project).toBeDefined();
        expect(claim.project.id).toBeDefined();
        expect(claim.project.name).toBeDefined();
      }

      // At least some claims should come from the parent project
      const claimsFromParent = dossierRes.body.claims.filter(
        (c: any) => c.project.id === parentId
      );
      expect(claimsFromParent.length).toBeGreaterThan(0);

      // Verify evidence is included in dossier claims
      const claimWithEvidence = dossierRes.body.claims.find(
        (c: any) => c.evidence && c.evidence.length > 0
      );
      expect(claimWithEvidence).toBeDefined();
      expect(claimWithEvidence.evidence[0].artifact).toBeDefined();
    });

    it('returns empty dossier when project has no dossier_id', async () => {
      const projectRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'No Target Company' })
        .expect(201);

      const dossierRes = await request(app)
        .get(`/projects/${projectRes.body.id}/dossier`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(dossierRes.body.dossier_id).toBeNull();
      expect(dossierRes.body.claims).toHaveLength(0);
    });
  });

  describe('US 45: Tenant isolation on dossier queries', () => {
    it('prevents cross-customer dossier claim access', async () => {
      const { projectId: parentId, claims: parentClaims } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Initial DD',
        'AcmeCorp'
      );
      expect(parentClaims.length).toBeGreaterThan(0);

      const { projectId: followupId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Follow-up',
        'AcmeCorp',
        parentId
      );

      // Customer 2 cannot access dossier claims
      const dossierRes = await request(app)
        .get(`/projects/${followupId}/dossier`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);
    });

    it('prevents cross-customer linked projects listing', async () => {
      const parentRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({ name: 'Parent', target_company: 'AcmeCorp' })
        .expect(201);

      const followupRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'Follow-up',
          parent_project_id: parentRes.body.id,
        })
        .expect(201);

      // Customer 2 cannot see linked projects
      await request(app)
        .get(`/projects/${followupRes.body.id}/linked`)
        .set(authHeaders(CUSTOMER_2))
        .expect(404);
    });

    it('returns only same-tenant claims even when target_company names match', async () => {
      // Customer 1 creates project with claims
      const { projectId: c1ProjectId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp DD',
        'AcmeCorp'
      );

      // Customer 2 creates project with same target company
      const { projectId: c2ProjectId } = await createProjectWithClaims(
        CUSTOMER_2,
        'AcmeCorp DD',
        'AcmeCorp'
      );

      // Customer 1's dossier should only contain customer 1's claims
      const dossierRes = await request(app)
        .get(`/projects/${c1ProjectId}/dossier`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(dossierRes.body.claims.length).toBeGreaterThan(0);
      for (const claim of dossierRes.body.claims) {
        expect(claim.customer_id).toBe(CUSTOMER_1);
      }

      // Customer 2's dossier should only contain customer 2's claims
      const dossierRes2 = await request(app)
        .get(`/projects/${c2ProjectId}/dossier`)
        .set(authHeaders(CUSTOMER_2))
        .expect(200);

      expect(dossierRes2.body.claims.length).toBeGreaterThan(0);
      for (const claim of dossierRes2.body.claims) {
        expect(claim.customer_id).toBe(CUSTOMER_2);
      }
    });
  });

  describe('US 46: Prior-project context for new drafts', () => {
    it('linked projects list includes prior projects in the dossier', async () => {
      const parentRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'Initial DD',
          target_company: 'AcmeCorp',
        })
        .expect(201);

      const followupRes = await request(app)
        .post('/projects')
        .set(authHeaders(CUSTOMER_1))
        .send({
          name: 'Follow-up',
          parent_project_id: parentRes.body.id,
        })
        .expect(201);

      const linkedRes = await request(app)
        .get(`/projects/${followupRes.body.id}/linked`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(linkedRes.body.projects).toHaveLength(1);
      expect(linkedRes.body.projects[0].id).toBe(parentRes.body.id);
      expect(linkedRes.body.projects[0].name).toBe('Initial DD');
      expect(linkedRes.body.dossier_id).toBeDefined();
    });

    it('dossier claims include workspace version context for longitudinal tracking', async () => {
      const { projectId: parentId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Initial DD',
        'AcmeCorp'
      );

      const { projectId: followupId } = await createProjectWithClaims(
        CUSTOMER_1,
        'AcmeCorp Follow-up',
        'AcmeCorp',
        parentId
      );

      const dossierRes = await request(app)
        .get(`/projects/${followupId}/dossier`)
        .set(authHeaders(CUSTOMER_1))
        .expect(200);

      expect(dossierRes.body.claims.length).toBeGreaterThan(0);

      // Each claim should have workspace version info for longitudinal tracking
      for (const claim of dossierRes.body.claims) {
        expect(claim.workspace_version).toBeDefined();
        expect(claim.workspace_version.version_number).toBeDefined();
      }

      // Claims should come from both projects
      const projectIds = [...new Set(dossierRes.body.claims.map((c: any) => c.project.id))];
      expect(projectIds).toContain(parentId);
      expect(projectIds).toContain(followupId);
    });
  });
});
