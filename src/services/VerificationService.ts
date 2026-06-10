import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../lib/errors';
import {
  completeLLM,
  isLLMConfigured,
  parseLLMJson,
  type LLMMessage,
} from './LLMService';

const FACTUAL_TYPES = ['financial_fact', 'market_fact', 'operational_kpi'];

// ─── Stub fallback (deterministic, used when no LLM API key configured) ───

async function verifyClaimsStub(projectId: string, customerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const claims = await prisma.claim.findMany({
    where: { project_id: projectId, customer_id: customerId },
    include: { evidence: true },
  });

  if (claims.length === 0) {
    throw new ValidationError('No claims to verify for this project');
  }

  const updatedClaims = [];

  for (const claim of claims) {
    const hasEvidence = claim.evidence.length > 0;

    // Detect contradictions: same claim type with different text
    const sameTypeClaims = claims.filter(
      (c) => c.type === claim.type && c.id !== claim.id
    );
    const hasContradictions =
      FACTUAL_TYPES.includes(claim.type) &&
      sameTypeClaims.some((c) => c.text !== claim.text);

    const status = !hasEvidence
      ? 'needs_review'
      : hasContradictions
        ? 'needs_review'
        : 'supported';

    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        status,
        metadata: {
          ...(typeof claim.metadata === 'object' && claim.metadata !== null
            ? claim.metadata
            : {}),
          confidence: {
            evidence_type: claim.type,
            source_reliability: claim.source_reliability ?? 'unverified',
            extraction_certainty: 'high',
            calculation_status: 'not_applicable',
            conflict_status: hasContradictions
              ? 'conflict_detected'
              : 'no_known_conflict',
            human_review: 'pending',
          },
          verification_result: {
            has_evidence: hasEvidence,
            has_contradictions: hasContradictions,
            verified_at: new Date().toISOString(),
          },
        },
      },
    });

    updatedClaims.push(updated);
  }

  return {
    claims_verified: updatedClaims.length,
    needs_review: updatedClaims.filter((c) => c.status === 'needs_review').length,
    supported: updatedClaims.filter((c) => c.status === 'supported').length,
    claims: updatedClaims,
  };
}

// ─── LLM-based verification ────────────────────────────────────────────

async function verifyClaimsWithLLM(projectId: string, customerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const claims = await prisma.claim.findMany({
    where: { project_id: projectId, customer_id: customerId },
    include: { evidence: true },
  });

  if (claims.length === 0) {
    throw new ValidationError('No claims to verify for this project');
  }

  // Build a clean representation for the LLM
  const claimsForLLM = claims.map((c) => ({
    id: c.id,
    type: c.type,
    text: c.text,
    source_reliability: c.source_reliability,
    evidence: c.evidence.map((e) => ({
      content: e.content,
      reliability: e.reliability_category,
    })),
  }));

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content:
        'You are a verification engine. You verify investment claims against evidence and determine whether each claim is supported, unsupported, or needs review. You always return valid JSON.',
    },
    {
      role: 'user',
      content: `Verify each of the following claims against the provided evidence.

For each claim, determine:
- status: supported, unsupported, or needs_review
- confidence: an object with these fields:
  - evidence_type: string (what type of evidence supports or contradicts the claim)
  - source_reliability: string (how reliable is the source)
  - extraction_certainty: string (how certain is the extraction from the source)
  - calculation_status: string (are calculations correct)
  - conflict_status: string (are there conflicts with other claims)
  - human_review: string (has a human reviewed this)
- notes: string (explanation of the verification result)

Claims:
${JSON.stringify(claimsForLLM, null, 2)}

Return a JSON object with a "verifications" array. Each verification must have:
- claim_id: string (the ID of the claim being verified)
- status: string (supported, unsupported, or needs_review)
- confidence: object
- notes: string

Return ONLY valid JSON. Do not include markdown formatting.`,
    },
  ];

  const result = await completeLLM({ messages, jsonMode: true, temperature: 0.2, maxTokens: 4096 });
  const parsed = parseLLMJson(result.content);
  const verifications = parsed.verifications || [];

  const updatedClaims = [];

  for (const verification of verifications) {
    const claim = claims.find((c) => c.id === verification.claim_id);
    if (!claim) continue;

    const status = verification.status || 'needs_review';
    const confidence = verification.confidence || {};

    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        status,
        metadata: {
          ...(typeof claim.metadata === 'object' && claim.metadata !== null
            ? claim.metadata
            : {}),
          confidence: {
            evidence_type: confidence.evidence_type || claim.type,
            source_reliability: confidence.source_reliability || claim.source_reliability || 'unverified',
            extraction_certainty: confidence.extraction_certainty || 'medium',
            calculation_status: confidence.calculation_status || 'not_applicable',
            conflict_status: confidence.conflict_status || 'no_known_conflict',
            human_review: confidence.human_review || 'pending',
          },
          verification_result: {
            has_evidence: claim.evidence.length > 0,
            has_contradictions: false, // LLM should surface this in notes
            verified_at: new Date().toISOString(),
            llm_verified: true,
            llm_notes: verification.notes || '',
          },
        },
      },
    });

    updatedClaims.push(updated);
  }

  // Handle claims that the LLM didn't verify
  for (const claim of claims) {
    if (updatedClaims.find((c) => c.id === claim.id)) continue;

    const updated = await prisma.claim.update({
      where: { id: claim.id },
      data: {
        status: 'needs_review',
        metadata: {
          ...(typeof claim.metadata === 'object' && claim.metadata !== null
            ? claim.metadata
            : {}),
          confidence: {
            evidence_type: claim.type,
            source_reliability: claim.source_reliability || 'unverified',
            extraction_certainty: 'medium',
            calculation_status: 'not_applicable',
            conflict_status: 'no_known_conflict',
            human_review: 'pending',
          },
          verification_result: {
            has_evidence: claim.evidence.length > 0,
            has_contradictions: false,
            verified_at: new Date().toISOString(),
            llm_verified: false,
            llm_notes: 'LLM did not return verification for this claim',
          },
        },
      },
    });

    updatedClaims.push(updated);
  }

  return {
    claims_verified: updatedClaims.length,
    needs_review: updatedClaims.filter((c) => c.status === 'needs_review').length,
    supported: updatedClaims.filter((c) => c.status === 'supported').length,
    claims: updatedClaims,
  };
}

// ─── Main entry point ──────────────────────────────────────────────────

export async function verifyClaims(projectId: string, customerId: string) {
  if (isLLMConfigured()) {
    try {
      return await verifyClaimsWithLLM(projectId, customerId);
    } catch (err) {
      console.warn('LLM verification failed, falling back to stub:', err instanceof Error ? err.message : String(err));
    }
  }
  return verifyClaimsStub(projectId, customerId);
}
