import { config } from '../lib/config';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Check if the LLM is configured with a valid API key.
 */
export function isLLMConfigured(): boolean {
  return !!config.FIREWORKS_API_KEY && config.FIREWORKS_API_KEY !== 'your-api-key-here';
}

/**
 * Estimate cost in cents from token usage.
 * Uses Llama 3.1 70B pricing: ~$0.90 per 1M tokens.
 */
export function estimateCostCents(totalTokens: number): number {
  return Math.round((totalTokens / 1000) * 0.09);
}

/**
 * Parse JSON from an LLM response, handling markdown code blocks.
 */
export function parseLLMJson(content: string): any {
  // Try to extract JSON from markdown code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  } else {
    // Try to find the first JSON object or array
    const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
  }
  return JSON.parse(content);
}

async function _callLLM(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
  if (!config.FIREWORKS_API_KEY) {
    throw new Error('LLM_NOT_CONFIGURED');
  }

  const body: any = {
    model: config.FIREWORKS_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
  };

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${config.FIREWORKS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.FIREWORKS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text.substring(0, 500)}`);
  }

  const data: any = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error('LLM returned empty choices');
  }

  const content = data.choices[0].message?.content;
  if (!content) {
    throw new Error('LLM returned empty content');
  }

  const usage = data.usage || {};

  return {
    content,
    model: data.model || config.FIREWORKS_MODEL,
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
  };
}

/**
 * Call the Fireworks LLM with automatic retry.
 */
export async function completeLLM(options: LLMCompletionOptions, retries = 1): Promise<LLMCompletionResult> {
  try {
    return await _callLLM(options);
  } catch (err) {
    if (retries > 0) {
      console.warn(`LLM call failed, retrying... (${retries} retries left): ${err instanceof Error ? err.message : String(err)}`);
      await new Promise(r => setTimeout(r, 1000));
      return completeLLM(options, retries - 1);
    }
    throw err;
  }
}
