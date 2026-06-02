import { prisma } from '../lib/prisma';
import { getArtifact } from './ArtifactService';
import { ValidationError, NotFoundError } from '../lib/errors';
import type { ResearchSummary } from './AgentService';

export async function extractClaimsFromArtifact(
  artifactId: string,
  customerId: string
) {
  const artifact = await getArtifact(artifactId, customerId);

  if (artifact.type !== 'research_summary') {
    throw new ValidationError('Artifact must be a research_summary to extract claims');
  }

  if (!artifact.extracted_text) {
    throw new ValidationError('Artifact has no extracted text');
  }

  let summary: ResearchSummary;
  try {
    summary = JSON.parse(artifact.extracted_text);
  } catch {
    throw new ValidationError('Artifact text is not valid JSON');
  }

  const claims: Array<{
    id: string;
    project_id: string;
    artifact_id: string;
    type: string;
    text: string;
    status: string;
  }> = [];
  const evidence: Array<{
    id: string;
    project_id: string;
    claim_id: string;
    artifact_id: string;
    content: string | null;
  }> = [];

  const projectId = artifact.project_id;
  const workspaceVersionId = artifact.workspace_version_id;

  // Helper to create a claim + evidence pair
  async function createClaim(
    text: string,
    type: 'financial_fact' | 'operational_kpi' | 'market_fact' | 'valuation_input' | 'management_assertion' | 'calculated_metric' | 'analyst_judgment' | 'risk' | 'hypothesis',
    reliability?: 'audited_filing' | 'management_assertion' | 'analyst_estimate' | 'third_party_verified' | 'unverified'
  ) {
    const claim = await prisma.claim.create({
      data: {
        project_id: projectId,
        customer_id: customerId,
        workspace_version_id: workspaceVersionId,
        artifact_id: artifactId,
        type,
        text: text.slice(0, 1000),
        status: 'draft',
        source_reliability: reliability ?? 'unverified',
        source_coordinates: {
          artifact_id: artifactId,
          section: type,
        },
      },
    });

    const ev = await prisma.evidence.create({
      data: {
        project_id: projectId,
        customer_id: customerId,
        claim_id: claim.id,
        artifact_id: artifactId,
        content: text.slice(0, 2000),
        reliability_category: reliability ?? 'unverified',
        source_coordinates: {
          artifact_id: artifactId,
          section: type,
        },
      },
    });

    claims.push(claim);
    evidence.push(ev);
    return claim;
  }

  // Extract claims from each summary section
  if (summary.company_overview) {
    await createClaim(summary.company_overview, 'management_assertion', 'management_assertion');
  }

  if (summary.business_model) {
    await createClaim(summary.business_model, 'management_assertion', 'management_assertion');
  }

  if (summary.revenue_model) {
    await createClaim(summary.revenue_model, 'management_assertion', 'management_assertion');
  }

  for (const figure of summary.key_financial_figures || []) {
    await createClaim(figure, 'financial_fact', 'management_assertion');
  }

  if (summary.customers_and_concentration) {
    await createClaim(summary.customers_and_concentration, 'operational_kpi', 'management_assertion');
  }

  if (summary.market_and_competitors) {
    await createClaim(summary.market_and_competitors, 'market_fact', 'management_assertion');
  }

  for (const strength of summary.strengths || []) {
    await createClaim(strength, 'analyst_judgment', 'analyst_estimate');
  }

  for (const risk of summary.risks || []) {
    await createClaim(risk, 'risk', 'analyst_estimate');
  }

  for (const question of summary.unanswered_questions || []) {
    await createClaim(question, 'hypothesis', 'unverified');
  }

  return { claims, evidence };
}

export async function listClaims(project_id: string, customer_id: string) {
  return prisma.claim.findMany({
    where: { project_id, customer_id },
    include: { evidence: true },
    orderBy: { created_at: 'desc' },
  });
}

export async function getClaim(id: string, customer_id: string) {
  const claim = await prisma.claim.findFirst({
    where: { id, customer_id },
    include: { evidence: true },
  });

  if (!claim) {
    throw new NotFoundError('Claim', id);
  }

  return claim;
}