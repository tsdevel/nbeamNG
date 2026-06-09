import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../lib/errors';
import { logEvent } from './EventService';

export interface CompletionResult {
  passed: boolean;
  checks: {
    claims_valid: boolean;
    dataneeds_resolved: boolean;
    thesis_complete: boolean;
  };
  blockers: string[];
  report_artifact_id?: string;
  export_lineage?: {
    workspace_version_id: string;
    claims_count: number;
    artifacts_count: number;
    invalidated_claims_excluded: number;
  };
}

export async function evaluateCompletion(
  projectId: string,
  customerId: string
): Promise<CompletionResult> {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, customer_id: customerId },
    include: {
      claims: true,
      data_needs: true,
      artifacts: true,
      workspace_versions: { orderBy: { version_number: 'desc' }, take: 1 },
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const blockers: string[] = [];

  // Check 1: All claims in the latest version must be valid (not needs_review, unsupported, or invalidated)
  // Earlier versions may have invalidated claims — they do not block current-version finalization
  const latestVersion = project.workspace_versions[0];
  const versionId = latestVersion?.id ?? '';
  const versionClaims = project.claims.filter((c) => c.workspace_version_id === versionId);

  const invalidClaims = versionClaims.filter(
    (c) => c.status === 'needs_review' || c.status === 'unsupported' || c.status === 'invalidated'
  );
  if (invalidClaims.length > 0) {
    const types = [...new Set(invalidClaims.map((c) => c.type))].join(', ');
    blockers.push(`${invalidClaims.length} claim(s) in invalid status: ${types}`);
  }

  // Check 2: All DataNeeds must be resolved (not open or needs_human_input)
  const unresolvedDataNeeds = project.data_needs.filter(
    (dn) => dn.status === 'open' || dn.status === 'needs_human_input'
  );
  if (unresolvedDataNeeds.length > 0) {
    blockers.push(`${unresolvedDataNeeds.length} unresolved DataNeed(s)`);
  }

  // Check 3: Investment thesis must be complete (at least one research_summary artifact)
  const hasThesis = project.artifacts.some((a) => a.type === 'research_summary');
  if (!hasThesis) {
    blockers.push('No research summary artifact found');
  }

  const passed = blockers.length === 0;

  if (!passed) {
    await logEvent({
      project_id: projectId,
      customer_id: customerId,
      event_type: 'finalization_blocked',
      payload: { blockers },
    });

    return {
      passed: false,
      checks: {
        claims_valid: invalidClaims.length === 0,
        dataneeds_resolved: unresolvedDataNeeds.length === 0,
        thesis_complete: hasThesis,
      },
      blockers,
    };
  }

  // All checks passed — generate report artifact
  // Collect valid claims from latest version only (no orphaned references)
  const validClaims = versionClaims.filter(
    (c) => c.status !== 'invalidated'
  );
  const excludedClaims = versionClaims.filter(
    (c) => c.status === 'invalidated'
  );

  // Collect research_summary artifacts
  const summaryArtifacts = project.artifacts.filter((a) => a.type === 'research_summary');

  const reportArtifact = await prisma.artifact.create({
    data: {
      id: `report-${projectId.slice(0, 8)}-${Date.now().toString(36)}`,
      project_id: projectId,
      workspace_version_id: versionId,
      customer_id: customerId,
      type: 'report',
      name: `IC Report — ${project.name}`,
      mime_type: 'application/json',
      extracted_text: JSON.stringify({
        title: `Investment Committee Report — ${project.name}`,
        target_company: project.target_company,
        generated_at: new Date().toISOString(),
        slides: [
          { section: 'executive_summary', source: 'research_summary' },
          { section: 'company_overview', source: 'research_summary' },
          { section: 'financial_analysis', source: 'research_summary' },
          { section: 'market_position', source: 'research_summary' },
          { section: 'risks_and_mitigations', source: 'research_summary' },
          { section: 'investment_thesis', source: 'research_summary' },
        ],
        claims_summary: {
          total: validClaims.length,
          by_type: validClaims.reduce((acc, c) => {
            acc[c.type] = (acc[c.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      }, null, 2),
      status: 'draft',
      metadata: {
        export_lineage: {
          workspace_version_id: versionId,
          version_number: latestVersion?.version_number ?? 1,
          claims_used: validClaims.map((c) => ({ id: c.id, type: c.type, text: c.text })),
          artifacts_used: summaryArtifacts.map((a) => ({ id: a.id, type: a.type })),
          invalidated_claims_excluded: excludedClaims.map((c) => ({ id: c.id, type: c.type })),
        },
        report_type: 'IC_memo',
        format: 'structured_json',
      } as Prisma.InputJsonValue,
    },
  });

  // Update project status to completed
  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'completed' },
  });

  await logEvent({
    project_id: projectId,
    customer_id: customerId,
    event_type: 'project_finalized',
    payload: {
      report_artifact_id: reportArtifact.id,
      workspace_version_id: versionId,
      valid_claims_count: validClaims.length,
      excluded_invalidated_claims: excludedClaims.length,
    },
  });

  return {
    passed: true,
    checks: {
      claims_valid: true,
      dataneeds_resolved: true,
      thesis_complete: true,
    },
    blockers: [],
    report_artifact_id: reportArtifact.id,
    export_lineage: {
      workspace_version_id: versionId,
      claims_count: validClaims.length,
      artifacts_count: summaryArtifacts.length,
      invalidated_claims_excluded: excludedClaims.length,
    },
  };
}
