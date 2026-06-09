import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../lib/errors';

const FACTUAL_TYPES = ['financial_fact', 'market_fact', 'operational_kpi'];

export async function verifyClaims(projectId: string, customerId: string) {
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