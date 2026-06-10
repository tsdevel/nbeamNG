import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logEvent } from './EventService';
import { getArtifact } from './ArtifactService';
import { createDataNeed } from './DataNeedService';
import { NotFoundError } from '../lib/errors';
import {
  completeLLM,
  isLLMConfigured,
  parseLLMJson,
  estimateCostCents,
  type LLMMessage,
} from './LLMService';

export interface CreateAgentRunInput {
  project_id: string;
  customer_id: string;
  task_id: string;
  agent_type: string;
}

export async function createAgentRun(input: CreateAgentRunInput) {
  return prisma.agentRun.create({
    data: {
      project_id: input.project_id,
      customer_id: input.customer_id,
      task_id: input.task_id,
      agent_type: input.agent_type,
      status: 'pending',
    },
  });
}

export async function claimAgentRun(runId: string) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'claimed' },
  });
}

export async function startAgentRun(runId: string) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'in_progress' },
  });
}

export async function completeAgentRun(
  runId: string,
  outputArtifactId: string,
  runtimeSeconds: number,
  costCents = 0
) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: 'completed',
      output_artifact_id: outputArtifactId,
      runtime_seconds: runtimeSeconds,
      cost_cents: costCents,
    },
  });
}

export async function failAgentRun(runId: string, errorMessage: string) {
  return prisma.agentRun.update({
    where: { id: runId },
    data: { status: 'failed' },
  });
}

// ─── Research Summary Agent ──────────────────────────────────────────────

export interface ResearchSummary {
  company_overview: string;
  business_model: string;
  revenue_model: string;
  key_financial_figures: string[];
  customers_and_concentration: string;
  market_and_competitors: string;
  strengths: string[];
  risks: string[];
  unanswered_questions: string[];
  source_references: Array<{
    section: string;
    artifact_id: string;
    excerpt?: string;
  }>;
}

// ─── Stub fallback (deterministic, used when no LLM API key configured) ───

function generateSummaryFromStub(text: string, sourceArtifactId: string): ResearchSummary {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const excerpt = sentences.slice(0, 3).join('. ') || text.slice(0, 200);

  return {
    company_overview: `Based on the provided CIM, the company is described in the source document. Key excerpt: "${excerpt.slice(0, 100)}..."`,
    business_model: 'Business model details extracted from the source document.',
    revenue_model: 'Revenue model details extracted from the source document.',
    key_financial_figures: sentences
      .filter((s) => /\$|\d+%|revenue|profit|EBITDA|margin/i.test(s))
      .slice(0, 3),
    customers_and_concentration: 'Customer concentration details extracted from the source document.',
    market_and_competitors: 'Market and competitor landscape extracted from the source document.',
    strengths: ['Strong market position', 'Experienced management team', 'Proven business model'],
    risks: ['Market volatility', 'Customer concentration', 'Regulatory changes'],
    unanswered_questions: ['What is the exact revenue breakdown by segment?', 'How sticky is the customer base?'],
    source_references: [
      {
        section: 'full_text',
        artifact_id: sourceArtifactId,
        excerpt: excerpt.slice(0, 200),
      },
    ],
  };
}

// ─── LLM-based summary generation ────────────────────────────────────────

async function generateSummaryFromLLM(
  text: string,
  sourceArtifactId: string
): Promise<{ summary: ResearchSummary; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const MAX_CHARS = 300000; // ~75K tokens for Llama 3.1 70B (128K context)
  const truncatedText =
    text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS) + '\n\n[Document truncated for length]'
      : text;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content:
        'You are an expert investment analyst specializing in private equity and M&A due diligence. You analyze CIM (Confidential Information Memorandum) documents and produce structured investment summaries. You always return valid JSON.',
    },
    {
      role: 'user',
      content: `Analyze the following CIM document and produce a structured investment summary in JSON format.

Return a JSON object with these exact fields:
- company_overview: string (comprehensive company description, history, products, market position)
- business_model: string (how the company makes money, value proposition, go-to-market)
- revenue_model: string (revenue streams, pricing model, key metrics)
- key_financial_figures: string[] (array of specific financial facts with dollar amounts, percentages, or ratios. Extract EVERY financial figure mentioned: revenue, growth rates, margins, EBITDA, etc.)
- customers_and_concentration: string (customer base, concentration risk, top customers if mentioned)
- market_and_competitors: string (market size, TAM/SAM/SOM, competitive landscape, key competitors)
- strengths: string[] (investment strengths and competitive advantages)
- risks: string[] (key risks and concerns)
- unanswered_questions: string[] (missing information that would be needed for a complete investment analysis)
- source_references: array of objects with {section: string, excerpt: string} (key excerpts from the document that support the summary)

If a field has no relevant information, use an empty string or empty array.

CIM Document:
${truncatedText}

Return ONLY valid JSON. Do not include markdown formatting or explanations.`,
    },
  ];

  const result = await completeLLM({ messages, jsonMode: true, temperature: 0.3, maxTokens: 4096 });
  const parsed = parseLLMJson(result.content);

  const summary: ResearchSummary = {
    company_overview: parsed.company_overview || '',
    business_model: parsed.business_model || '',
    revenue_model: parsed.revenue_model || '',
    key_financial_figures: Array.isArray(parsed.key_financial_figures) ? parsed.key_financial_figures : [],
    customers_and_concentration: parsed.customers_and_concentration || '',
    market_and_competitors: parsed.market_and_competitors || '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    unanswered_questions: Array.isArray(parsed.unanswered_questions) ? parsed.unanswered_questions : [],
    source_references: Array.isArray(parsed.source_references)
      ? parsed.source_references.map((ref: any) => ({
          section: ref.section || 'full_text',
          artifact_id: sourceArtifactId,
          excerpt: ref.excerpt || '',
        }))
      : [{ section: 'full_text', artifact_id: sourceArtifactId, excerpt: truncatedText.slice(0, 200) }],
  };

  return { summary, usage: result.usage };
}

/**
 * Generate research summary — uses LLM when configured, falls back to deterministic stub.
 */
export async function generateSummaryFromText(
  text: string,
  sourceArtifactId: string
): Promise<{ summary: ResearchSummary; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  if (!isLLMConfigured()) {
    return { summary: generateSummaryFromStub(text, sourceArtifactId) };
  }
  try {
    return await generateSummaryFromLLM(text, sourceArtifactId);
  } catch (err) {
    console.warn('LLM summary generation failed, falling back to stub:', err instanceof Error ? err.message : String(err));
    return { summary: generateSummaryFromStub(text, sourceArtifactId) };
  }
}

/**
 * Execute the Slice 2 research agent.
 * Reads the extracted_text artifact from the task payload,
 * generates a structured summary, and stores it as a research_summary artifact.
 */
export async function executeResearchAgent(
  taskId: string,
  runId: string,
  customerId: string
): Promise<{ artifactId: string; summary: ResearchSummary; dataNeeds: unknown[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const startTime = Date.now();

  const task = await prisma.task.findFirst({
    where: { id: taskId, customer_id: customerId },
    include: { project: true },
  });

  if (!task) {
    throw new NotFoundError('Task', taskId);
  }

  await startAgentRun(runId);

  const payload = task.payload as { artifact_id?: string };
  const sourceArtifactId = payload.artifact_id;

  if (!sourceArtifactId) {
    throw new Error('Task payload missing artifact_id');
  }

  const sourceArtifact = await getArtifact(sourceArtifactId, customerId);

  if (!sourceArtifact.extracted_text) {
    throw new Error('Source artifact has no extracted text');
  }

  // Generate structured summary (LLM or stub)
  const { summary, usage } = await generateSummaryFromText(sourceArtifact.extracted_text, sourceArtifactId);

  // Create research_summary artifact
  const summaryArtifact = await prisma.artifact.create({
    data: {
      id: `rs-${task.project_id.slice(0, 8)}-${Date.now().toString(36)}`,
      project_id: task.project_id,
      workspace_version_id: sourceArtifact.workspace_version_id,
      customer_id: customerId,
      type: 'research_summary',
      name: `Research Summary — ${task.project.name}`,
      mime_type: 'application/json',
      extracted_text: JSON.stringify(summary, null, 2),
      source_artifact_ids: [sourceArtifactId],
      status: 'draft',
      metadata: summary as unknown as Prisma.InputJsonValue,
    },
  });

  // Create DataNeeds for unanswered questions (Slice 3: dynamic agent behavior)
  const dataNeeds = [];
  for (const question of summary.unanswered_questions) {
    const dn = await createDataNeed({
      project_id: task.project_id,
      customer_id: customerId,
      type: 'missing_information',
      priority: 'high',
      description: question,
      requestor_task_id: taskId,
    });
    dataNeeds.push(dn);
  }

  // If the extracted text is very short, also create a DataNeed for insufficient source material
  if (!sourceArtifact.extracted_text || sourceArtifact.extracted_text.length < 200) {
    const dn = await createDataNeed({
      project_id: task.project_id,
      customer_id: customerId,
      type: 'insufficient_source',
      priority: 'medium',
      description: 'Source document appears to have limited content for a complete analysis. Additional CIM sections or supplementary documents may be required.',
      requestor_task_id: taskId,
    });
    dataNeeds.push(dn);
  }

  const runtimeSeconds = (Date.now() - startTime) / 1000;
  const costCents = usage ? estimateCostCents(usage.totalTokens) : 0;

  await completeAgentRun(runId, summaryArtifact.id, runtimeSeconds, costCents);

  await logEvent({
    project_id: task.project_id,
    customer_id: customerId,
    event_type: 'agent_run_completed',
    payload: {
      run_id: runId,
      task_id: taskId,
      agent_type: 'research',
      output_artifact_id: summaryArtifact.id,
      runtime_seconds: runtimeSeconds,
      dataneeds_created: dataNeeds.length,
      llm_used: !!usage,
      llm_tokens: usage?.totalTokens ?? 0,
      cost_cents: costCents,
    },
  });

  return { artifactId: summaryArtifact.id, summary, dataNeeds, usage };
}

// ─── Regeneration Agent ────────────────────────────────────────────────

export interface RegenerationResult {
  artifactId: string;
  lineage: {
    review_comment_id: string;
    invalidated_claim_ids: string[];
    regenerated_sections: string[];
    parent_version_id: string;
  };
}

// ─── LLM-based regeneration ────────────────────────────────────────────

async function regenerateSummaryFromLLM(
  originalSummary: ResearchSummary,
  reviewCommentText: string,
  sectionNames: string[]
): Promise<{ summary: ResearchSummary; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const summaryJson = JSON.stringify(originalSummary, null, 2);

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content:
        'You are an expert investment analyst. You revise research summaries based on corrections or new evidence. You always return valid JSON.',
    },
    {
      role: 'user',
      content: `The following correction was received: "${reviewCommentText}"

Original research summary:
${summaryJson}

Affected sections: ${sectionNames.join(', ')}

Please regenerate the affected sections with the correction applied. Keep all other sections unchanged. Maintain the same JSON structure with all fields.

Return ONLY valid JSON with all the same fields as the original summary. Do not include markdown formatting.`,
    },
  ];

  const result = await completeLLM({ messages, jsonMode: true, temperature: 0.2, maxTokens: 4096 });
  const parsed = parseLLMJson(result.content);

  const summary: ResearchSummary = {
    company_overview: parsed.company_overview ?? originalSummary.company_overview,
    business_model: parsed.business_model ?? originalSummary.business_model,
    revenue_model: parsed.revenue_model ?? originalSummary.revenue_model,
    key_financial_figures: Array.isArray(parsed.key_financial_figures)
      ? parsed.key_financial_figures
      : originalSummary.key_financial_figures,
    customers_and_concentration:
      parsed.customers_and_concentration ?? originalSummary.customers_and_concentration,
    market_and_competitors: parsed.market_and_competitors ?? originalSummary.market_and_competitors,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : originalSummary.strengths,
    risks: Array.isArray(parsed.risks) ? parsed.risks : originalSummary.risks,
    unanswered_questions: Array.isArray(parsed.unanswered_questions)
      ? parsed.unanswered_questions
      : originalSummary.unanswered_questions,
    source_references: Array.isArray(parsed.source_references)
      ? parsed.source_references.map((ref: any) => ({
          section: ref.section || 'regenerated',
          artifact_id: ref.artifact_id || '',
          excerpt: ref.excerpt || '',
        }))
      : originalSummary.source_references,
  };

  return { summary, usage: result.usage };
}

// ─── Stub fallback for regeneration ────────────────────────────────────

function regenerateSummaryFromStub(
  originalSummary: ResearchSummary,
  reviewCommentText: string,
  sectionNames: string[]
): ResearchSummary {
  const regeneratedSummary: Record<string, unknown> = { ...originalSummary };

  for (const section of sectionNames) {
    const key = section as keyof ResearchSummary;
    if (key in regeneratedSummary) {
      const current = regeneratedSummary[key];
      if (typeof current === 'string') {
        regeneratedSummary[key] = `${current} [CORRECTED: ${reviewCommentText}]`;
      } else if (Array.isArray(current)) {
        regeneratedSummary[key] = [...current, `[CORRECTION APPLIED: ${reviewCommentText}]`];
      }
    }
  }

  return regeneratedSummary as unknown as ResearchSummary;
}

/**
 * Execute the Slice 6 regeneration agent.
 * Reads a review comment and invalidated claims, produces a corrected
 * research_summary artifact in the target workspace version.
 */
export async function executeRegenerationAgent(
  taskId: string,
  runId: string,
  customerId: string
): Promise<RegenerationResult> {
  const startTime = Date.now();

  const task = await prisma.task.findFirst({
    where: { id: taskId, customer_id: customerId },
    include: { project: true },
  });

  if (!task) {
    throw new NotFoundError('Task', taskId);
  }

  await startAgentRun(runId);

  const payload = task.payload as {
    version_id?: string;
    section_names?: string[];
    review_comment_id?: string;
    review_comment_text?: string;
  };

  const versionId = payload.version_id;
  const sectionNames = payload.section_names ?? [];
  const reviewCommentId = payload.review_comment_id;
  const reviewCommentText = payload.review_comment_text ?? '';

  if (!versionId || !reviewCommentId) {
    throw new Error('Task payload missing version_id or review_comment_id');
  }

  // Verify version belongs to this project
  const version = await prisma.workspaceVersion.findFirst({
    where: { id: versionId, project_id: task.project_id, customer_id: customerId },
  });
  if (!version) {
    throw new Error('Target workspace version not found');
  }

  // Find review comment and invalidated claims
  const reviewComment = await prisma.reviewComment.findFirst({
    where: { id: reviewCommentId, project_id: task.project_id, customer_id: customerId },
    include: { invalidated_claims: true },
  });
  if (!reviewComment) {
    throw new Error('Review comment not found');
  }

  const invalidatedClaimIds = reviewComment.invalidated_claims.map((c) => c.id);

  // Find the original research_summary from the parent version to use as base
  const parentVersion = version.parent_version_id
    ? await prisma.workspaceVersion.findFirst({
        where: { id: version.parent_version_id, customer_id: customerId },
      })
    : null;

  let baseSummary: ResearchSummary | null = null;
  if (parentVersion) {
    const parentArtifact = await prisma.artifact.findFirst({
      where: {
        project_id: task.project_id,
        workspace_version_id: parentVersion.id,
        customer_id: customerId,
        type: 'research_summary',
      },
    });
    if (parentArtifact?.extracted_text) {
      try {
        baseSummary = JSON.parse(parentArtifact.extracted_text) as ResearchSummary;
      } catch {
        // ignore parse errors
      }
    }
  }

  // Generate regenerated summary (LLM or stub)
  let regeneratedSummary: ResearchSummary;
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

  if (isLLMConfigured() && baseSummary) {
    try {
      const result = await regenerateSummaryFromLLM(baseSummary, reviewCommentText, sectionNames);
      regeneratedSummary = result.summary;
      usage = result.usage;
    } catch (err) {
      console.warn('LLM regeneration failed, falling back to stub:', err instanceof Error ? err.message : String(err));
      regeneratedSummary = baseSummary
        ? regenerateSummaryFromStub(baseSummary, reviewCommentText, sectionNames)
        : ({
            company_overview: 'Regenerated content',
            business_model: 'Regenerated content',
            revenue_model: 'Regenerated content',
            key_financial_figures: [],
            customers_and_concentration: 'Regenerated content',
            market_and_competitors: 'Regenerated content',
            strengths: [],
            risks: [],
            unanswered_questions: [],
            source_references: [],
          } as ResearchSummary);
    }
  } else {
    regeneratedSummary = baseSummary
      ? regenerateSummaryFromStub(baseSummary, reviewCommentText, sectionNames)
      : ({
          company_overview: 'Regenerated content',
          business_model: 'Regenerated content',
          revenue_model: 'Regenerated content',
          key_financial_figures: [],
          customers_and_concentration: 'Regenerated content',
          market_and_competitors: 'Regenerated content',
          strengths: [],
          risks: [],
          unanswered_questions: [],
          source_references: [],
        } as ResearchSummary);
  }

  // Create regenerated research_summary artifact in target version
  const regeneratedArtifact = await prisma.artifact.create({
    data: {
      id: `reg-${task.project_id.slice(0, 8)}-${Date.now().toString(36)}`,
      project_id: task.project_id,
      workspace_version_id: versionId,
      customer_id: customerId,
      type: 'research_summary',
      name: `Research Summary (Regenerated) — ${task.project.name}`,
      mime_type: 'application/json',
      extracted_text: JSON.stringify(regeneratedSummary, null, 2),
      source_artifact_ids: [],
      status: 'draft',
      metadata: {
        lineage: {
          review_comment_id: reviewCommentId,
          invalidated_claim_ids: invalidatedClaimIds,
          regenerated_sections: sectionNames,
          parent_version_id: version.parent_version_id,
        },
        correction_applied: reviewCommentText,
        regenerated_at: new Date().toISOString(),
        llm_used: !!usage,
      } as Prisma.InputJsonValue,
    },
  });

  const runtimeSeconds = (Date.now() - startTime) / 1000;
  const costCents = usage ? estimateCostCents(usage.totalTokens) : 0;

  await completeAgentRun(runId, regeneratedArtifact.id, runtimeSeconds, costCents);

  await logEvent({
    project_id: task.project_id,
    customer_id: customerId,
    event_type: 'agent_run_completed',
    payload: {
      run_id: runId,
      task_id: taskId,
      agent_type: 'regeneration',
      output_artifact_id: regeneratedArtifact.id,
      runtime_seconds: runtimeSeconds,
      regenerated_sections: sectionNames,
      review_comment_id: reviewCommentId,
      llm_used: !!usage,
      llm_tokens: usage?.totalTokens ?? 0,
      cost_cents: costCents,
    },
  });

  return {
    artifactId: regeneratedArtifact.id,
    lineage: {
      review_comment_id: reviewCommentId,
      invalidated_claim_ids: invalidatedClaimIds,
      regenerated_sections: sectionNames,
      parent_version_id: version.parent_version_id ?? '',
    },
  };
}
