import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logEvent } from './EventService';
import { getArtifact } from './ArtifactService';
import { createDataNeed } from './DataNeedService';
import { NotFoundError } from '../lib/errors';

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
    data: {
      status: 'failed',
    },
  });
}

// ─── Research Summary Agent (deterministic, Slice 2) ───────────────────

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

function generateSummaryFromText(text: string, sourceArtifactId: string): ResearchSummary {
  // Deterministic template-based summary for Slice 2.
  // In production, this would call an LLM via the abstracted provider interface.
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

/**
 * Execute the Slice 2 research agent.
 * Reads the extracted_text artifact from the task payload,
 * generates a structured summary, and stores it as a research_summary artifact.
 */
export async function executeResearchAgent(
  taskId: string,
  runId: string,
  customerId: string
): Promise<{ artifactId: string; summary: ResearchSummary; dataNeeds: unknown[] }> {
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

  // Generate structured summary
  const summary = generateSummaryFromText(sourceArtifact.extracted_text, sourceArtifactId);

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

  await completeAgentRun(runId, summaryArtifact.id, runtimeSeconds);

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
    },
  });

  return { artifactId: summaryArtifact.id, summary, dataNeeds };
}