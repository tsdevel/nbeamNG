import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../lib/errors';
import { logEvent } from './EventService';
import { createRegenerationTask } from './ReviewService';

// Over-invalidation map: every claim type always affects executive_summary,
// plus all sections that could plausibly depend on that claim type.
const CLAIM_TYPE_IMPACT_MAP: Record<string, string[]> = {
  financial_fact: ['revenue_model', 'key_financial_figures', 'financial_summary', 'valuation', 'executive_summary'],
  market_fact: ['market_and_competitors', 'executive_summary'],
  operational_kpi: ['business_model', 'customers_and_concentration', 'executive_summary'],
  management_assertion: ['company_overview', 'business_model', 'revenue_model', 'executive_summary'],
  analyst_judgment: ['strengths', 'risks', 'executive_summary'],
  risk: ['risks', 'executive_summary'],
  calculated_metric: ['valuation', 'financial_summary', 'executive_summary'],
  valuation_input: ['valuation', 'executive_summary'],
  hypothesis: ['unanswered_questions', 'executive_summary'],
};

export interface ImpactSuggestion {
  review_comment_id: string;
  invalidated_claim_id: string;
  claim_type: string;
  suggested_sections: string[];
  over_invalidate_warning: string;
}

export interface ConfirmImpactInput {
  confirmed_sections: string[];
}

export async function analyzeImpact(
  reviewCommentId: string,
  projectId: string,
  customerId: string
): Promise<ImpactSuggestion> {
  const comment = await prisma.reviewComment.findFirst({
    where: { id: reviewCommentId, project_id: projectId, customer_id: customerId },
    include: { invalidated_claims: true, target_claim: true },
  });

  if (!comment) {
    throw new NotFoundError('Review comment not found');
  }

  if (comment.type !== 'correction') {
    throw new ValidationError('Impact analysis only available for correction-type review comments');
  }

  const invalidatedClaim = comment.invalidated_claims[0];
  if (!invalidatedClaim) {
    throw new ValidationError('No invalidated claim found for this review comment');
  }

  const claimType = invalidatedClaim.type;
  const suggestedSections = CLAIM_TYPE_IMPACT_MAP[claimType] ?? ['executive_summary'];

  // Persist suggestions in comment metadata for audit trail
  await prisma.reviewComment.update({
    where: { id: reviewCommentId },
    data: {
      metadata: {
        ...(typeof comment.metadata === 'object' && comment.metadata !== null ? comment.metadata : {}),
        impact_analysis: {
          suggested_sections: suggestedSections,
          invalidated_claim_id: invalidatedClaim.id,
          claim_type: claimType,
          analyzed_at: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });

  return {
    review_comment_id: reviewCommentId,
    invalidated_claim_id: invalidatedClaim.id,
    claim_type: claimType,
    suggested_sections: suggestedSections,
    over_invalidate_warning: 'Suggested sections include all potentially affected areas. Unselected sections may still contain stale data.',
  };
}

export async function confirmImpact(
  reviewCommentId: string,
  projectId: string,
  customerId: string,
  input: ConfirmImpactInput
) {
  const comment = await prisma.reviewComment.findFirst({
    where: { id: reviewCommentId, project_id: projectId, customer_id: customerId },
  });

  if (!comment) {
    throw new NotFoundError('Review comment not found');
  }

  if (input.confirmed_sections.length === 0) {
    throw new ValidationError('At least one section must be confirmed for regeneration');
  }

  // Verify the comment has been analyzed (impact suggestions exist)
  const metadata = (comment.metadata ?? {}) as any;
  if (!metadata.impact_analysis?.suggested_sections) {
    throw new ValidationError('Impact analysis must be performed before confirmation');
  }

  // Persist confirmed sections
  await prisma.reviewComment.update({
    where: { id: reviewCommentId },
    data: {
      metadata: {
        ...metadata,
        impact_analysis: {
          ...metadata.impact_analysis,
          confirmed_sections: input.confirmed_sections,
          confirmed_at: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });

  // Find the latest workspace version for this project
  const latestVersion = await prisma.workspaceVersion.findFirst({
    where: { project_id: projectId, customer_id: customerId },
    orderBy: { version_number: 'desc' },
  });

  if (!latestVersion) {
    throw new NotFoundError('No workspace version found for this project');
  }

  // Create new workspace version (v3 from v2, or v2 from v1, etc.)
  const nextVersionNumber = latestVersion.version_number + 1;
  const newVersion = await prisma.workspaceVersion.create({
    data: {
      project_id: projectId,
      customer_id: customerId,
      version_number: nextVersionNumber,
      parent_version_id: latestVersion.id,
    },
  });

  // Auto-create regeneration task for confirmed sections only (minimal delta)
  const task = await createRegenerationTask(projectId, customerId, {
    version_id: newVersion.id,
    section_names: input.confirmed_sections,
    review_comment_id: reviewCommentId,
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'impact_confirmed',
    payload: {
      review_comment_id: reviewCommentId,
      confirmed_sections: input.confirmed_sections,
      new_version_id: newVersion.id,
      new_version_number: nextVersionNumber,
      regeneration_task_id: task.id,
    },
  });

  return {
    review_comment_id: reviewCommentId,
    confirmed_sections: input.confirmed_sections,
    new_version: newVersion,
    regeneration_task: task,
  };
}
