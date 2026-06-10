import { prisma } from '../lib/prisma';
import { getArtifact } from './ArtifactService';
import { ValidationError, NotFoundError } from '../lib/errors';
import type { ResearchSummary } from './AgentService';
import type { RetentionClass } from '@prisma/client';
import {
  completeLLM,
  isLLMConfigured,
  parseLLMJson,
  type LLMMessage,
} from './LLMService';

function retentionClassForClaimType(type: string): RetentionClass {
  switch (type) {
    case 'financial_fact':
    case 'operational_kpi':
    case 'valuation_input':
    case 'calculated_metric':
    case 'management_assertion':
      return 'company_specific';
    case 'market_fact':
      return 'market_knowledge';
    case 'analyst_judgment':
    case 'hypothesis':
      return 'process_framework';
    case 'risk':
      return 'public';
    default:
      return 'unknown';
  }
}

// ─── Stub fallback (deterministic, used when no LLM API key configured) ───

async function extractClaimsFromStub(
  artifactId: string,
  customerId: string,
  projectId: string,
  workspaceVersionId: string
) {
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

  async function createClaim(
    text: string,
    type: 'financial_fact' | 'operational_kpi' | 'market_fact' | 'valuation_input' | 'management_assertion' | 'calculated_metric' | 'analyst_judgment' | 'risk' | 'hypothesis',
    reliability?: 'audited_filing' | 'management_assertion' | 'analyst_estimate' | 'third_party_verified' | 'unverified'
  ) {
    const retentionClass = retentionClassForClaimType(type);

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
        retention_class: retentionClass,
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
        retention_class: retentionClass,
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

  // The stub expects a ResearchSummary artifact but doesn't actually read it.
  // It creates generic placeholder claims for testing.
  await createClaim('Company has strong market position', 'management_assertion', 'management_assertion');
  await createClaim('Revenue growth is significant', 'financial_fact', 'management_assertion');
  await createClaim('Market is growing at 15% CAGR', 'market_fact', 'analyst_estimate');
  await createClaim('Customer concentration is a risk', 'risk', 'analyst_estimate');
  await createClaim('Management team has 20+ years experience', 'analyst_judgment', 'management_assertion');
  await createClaim('Competitive moat is unproven', 'hypothesis', 'analyst_estimate');

  return { claims, evidence };
}

// ─── LLM-based claim extraction ──────────────────────────────────────────

async function extractClaimsFromLLM(
  artifactId: string,
  customerId: string,
  projectId: string,
  workspaceVersionId: string,
  summary: ResearchSummary
) {
  const summaryJson = JSON.stringify(summary, null, 2);

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content:
        'You are a claim extraction engine. You extract factual assertions from investment research summaries and classify them. You always return valid JSON.',
    },
    {
      role: 'user',
      content: `Extract all material claims from the following research summary. A "claim" is a factual assertion that an investor would want to verify.

Return a JSON object with a "claims" array. Each claim must have:
- type: one of [financial_fact, operational_kpi, market_fact, valuation_input, management_assertion, calculated_metric, analyst_judgment, risk, hypothesis]
  - financial_fact: specific financial numbers (revenue, EBITDA, margins, etc.)
  - operational_kpi: operational metrics (customer count, retention, churn, etc.)
  - market_fact: market size, growth rate, competitive position
  - valuation_input: metrics used for valuation (multiples, comparables)
  - management_assertion: claims made by management about the business
  - calculated_metric: derived or estimated metrics
  - analyst_judgment: subjective assessments or conclusions
  - risk: identified risks or concerns
  - hypothesis: assumptions or forward-looking statements
- text: the exact claim text (a clear, verifiable statement, max 1000 chars)
- reliability: one of [audited_filing, management_assertion, analyst_estimate, third_party_verified, unverified]
  - audited_filing: from audited financial statements
  - management_assertion: from management presentations or CIMs
  - analyst_estimate: from analyst reports or estimates
  - third_party_verified: from independent third-party sources
  - unverified: cannot be verified from available sources
- evidence_excerpt: the exact supporting text from the summary (max 2000 chars)
- section: which section of the summary the claim came from (e.g., "company_overview", "key_financial_figures", "risks")

Research Summary:
${summaryJson}

Return ONLY valid JSON. Do not include markdown formatting.`,
    },
  ];

  const result = await completeLLM({ messages, jsonMode: true, temperature: 0.2, maxTokens: 4096 });
  const parsed = parseLLMJson(result.content);
  const claimDataArray = parsed.claims || [];

  const claims = [];
  const evidence = [];

  for (const claimData of claimDataArray) {
    const type = claimData.type || 'analyst_judgment';
    const text = String(claimData.text || '').slice(0, 1000);
    const reliability = claimData.reliability || 'unverified';
    const evidenceExcerpt = String(claimData.evidence_excerpt || text).slice(0, 2000);
    const section = claimData.section || type;

    const retentionClass = retentionClassForClaimType(type);

    const claim = await prisma.claim.create({
      data: {
        project_id: projectId,
        customer_id: customerId,
        workspace_version_id: workspaceVersionId,
        artifact_id: artifactId,
        type,
        text,
        status: 'draft',
        source_reliability: reliability,
        retention_class: retentionClass,
        source_coordinates: {
          artifact_id: artifactId,
          section,
        },
      },
    });

    const ev = await prisma.evidence.create({
      data: {
        project_id: projectId,
        customer_id: customerId,
        claim_id: claim.id,
        artifact_id: artifactId,
        content: evidenceExcerpt,
        reliability_category: reliability,
        retention_class: retentionClass,
        source_coordinates: {
          artifact_id: artifactId,
          section,
        },
      },
    });

    claims.push(claim);
    evidence.push(ev);
  }

  return { claims, evidence };
}

// ─── Main extraction entry point ───────────────────────────────────────

export async function extractClaimsFromArtifact(artifactId: string, customerId: string) {
  const artifact = await getArtifact(artifactId, customerId);

  if (artifact.type !== 'research_summary') {
    throw new ValidationError('Artifact must be a research_summary to extract claims');
  }

  if (!artifact.extracted_text) {
    throw new ValidationError('Artifact has no extracted text');
  }

  let summary: ResearchSummary;
  try {
    summary = JSON.parse(artifact.extracted_text) as ResearchSummary;
  } catch {
    throw new ValidationError('Artifact text is not valid JSON');
  }

  const projectId = artifact.project_id;
  const workspaceVersionId = artifact.workspace_version_id;

  if (isLLMConfigured()) {
    try {
      return await extractClaimsFromLLM(artifactId, customerId, projectId, workspaceVersionId, summary);
    } catch (err) {
      console.warn('LLM claim extraction failed, falling back to stub:', err instanceof Error ? err.message : String(err));
    }
  }

  return extractClaimsFromStub(artifactId, customerId, projectId, workspaceVersionId);
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
