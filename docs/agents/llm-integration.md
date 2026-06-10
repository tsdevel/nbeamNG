# LLM Integration (Path 1)

The NbeamNG backend supports real LLM-powered analysis via **Fireworks.ai** models. When no API key is configured, the system falls back to deterministic stubs (used for integration tests and local development without API costs).

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  PDF Upload     │────▶│  pdf-parse   │────▶│  Extracted Text │
│  (Slice 1)      │     │  (basic)     │     │  Artifact       │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Research Task  │◀───│  Task Queue   │     │  LLM Research   │
│  (Slice 2)      │     │  Polling API  │────▶│  Agent          │
└─────────────────┘     └──────────────┘     │  (Fireworks.ai) │
       │                                       └─────────────────┘
       │                                                │
       ▼                                                ▼
┌─────────────────┐                            ┌─────────────────┐
│  Claims +       │◀───────────────────────────│  Research       │
│  Evidence       │       Extract Claims       │  Summary        │
│  (Slice 4)      │      (LLM-powered)         │  Artifact       │
└─────────────────┘                            └─────────────────┘
       │
       ▼
┌─────────────────┐
│  Verification   │  (LLM-powered: compares claims against evidence)
│  (Slice 5)      │
└─────────────────┘
```

## Configuration

Add to your `.env` file:

```bash
# Fireworks.ai LLM configuration
# Get your API key at https://fireworks.ai/account/api-keys
FIREWORKS_API_KEY=fw-your-api-key-here
FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
FIREWORKS_MODEL=accounts/fireworks/models/llama-v3p1-70b-instruct
```

### Model Recommendations

| Model | Context | Cost | Best For |
|---|---|---|---|
| `accounts/fireworks/models/llama-v3p1-70b-instruct` | 128K | ~$0.90/M tokens | **Default** — good balance of capability and cost |
| `accounts/fireworks/models/mixtral-8x22b-instruct` | 64K | ~$0.90/M tokens | Complex reasoning, multilingual |
| `accounts/fireworks/models/llama-v3p1-405b-instruct` | 128K | ~$3.00/M tokens | Maximum accuracy, slowest |

The default **Llama 3.1 70B** is sufficient for most CIM analysis. The 128K context window handles ~300K characters of document text.

## LLM-Powered Endpoints

| Slice | Endpoint | LLM Function | What It Does |
|---|---|---|---|
| Slice 2 | `POST /tasks/:id/execute-research` | `generateSummaryFromLLM` | Reads extracted CIM text → structured JSON summary |
| Slice 4 | `POST /artifacts/:id/extract-claims` | `extractClaimsFromLLM` | Reads research summary → typed claims + evidence |
| Slice 5 | `POST /projects/:id/verify-claims` | `verifyClaimsWithLLM` | Compares claims against evidence → status + confidence |
| Slice 6 | `POST /tasks/:id/execute-regeneration` | `regenerateSummaryFromLLM` | Reads original summary + correction → corrected summary |

## Fallback Behavior

All LLM functions check `isLLMConfigured()` before calling the API:

```typescript
if (!isLLMConfigured()) {
  return stub(); // deterministic, fast, free
}
try {
  return await llmCall(); // real intelligence, costs tokens
} catch (err) {
  console.warn('LLM failed, falling back to stub');
  return stub(); // graceful degradation
}
```

**No API key configured** → stubs run (integration tests pass, zero cost).

**API key configured** → real LLM calls (costs money, slower, better analysis).

**API key configured but call fails** → logs warning, falls back to stub (system never crashes).

## Cost Tracking

Every LLM call tracks token usage and estimates cost:

```typescript
// Llama 3.1 70B pricing: ~$0.90 per 1M tokens
const costCents = estimateCostCents(totalTokens); // Math.round((totalTokens / 1000) * 0.09)
```

Cost is stored in `AgentRun.cost_cents` and logged in the event stream:

```json
{
  "event_type": "agent_run_completed",
  "payload": {
    "llm_used": true,
    "llm_tokens": 15420,
    "cost_cents": 1
  }
}
```

## Prompt Engineering

Each LLM call uses a **system prompt + user prompt** pattern with `jsonMode: true`:

- **System**: Defines the agent persona (investment analyst, claim extractor, verifier)
- **User**: Provides the document/summary/claims + explicit JSON schema instructions
- **JSON mode**: Fireworks `response_format: { type: 'json_object' }` enforces structured output
- **Retry**: Failed calls retry once after 1 second delay
- **Validation**: Parsed JSON is validated against expected fields; missing fields get defaults

### Prompt Quality Tips

The prompts are tuned for:
1. **Extraction completeness**: Financial facts, market data, and risks are extracted aggressively
2. **Verifiability**: Claims are phrased as clear, testable statements
3. **Source tracing**: Every claim links back to an excerpt from the source document
4. **Confidence calibration**: The model is asked to rate reliability (audited vs. management assertion vs. analyst estimate)

## Testing with LLM Enabled

To test the full LLM pipeline:

```bash
# 1. Set your API key in .env
FIREWORKS_API_KEY=fw-your-key

# 2. Start the backend
npm run dev

# 3. Use the test UI (or curl) to trigger a research task
# Upload a PDF → create research task → claim → execute
# The research summary will be generated by the LLM, not the stub

# 4. Check the event log for LLM usage
# Look for "llm_used": true and "cost_cents" in the payload
```

**Warning**: Integration tests use stubs (no API key = free). If you add a real API key and run tests, they will cost money and be slow. Keep tests stubbed.

## Future Improvements

| Improvement | Impact | Effort |
|---|---|---|
| Chunked document processing (RAG) | Handle 500+ page CIMs | Medium |
| Few-shot examples in prompts | Better extraction accuracy | Low |
| Structured output via `json_schema` | More reliable than JSON mode | Low |
| Model routing (70B for summary, 405B for verification) | Cost/quality optimization | Medium |
| Embedding-based contradiction detection | Verify claims via semantic search | High |
| Image/chart extraction (OCR + vision) | Analyze financial tables and charts | High |

## Next Step: External Agents (Path 2)

See [external-agent-contract.md](external-agent-contract.md) for the full API contract to build external agent services (Python, LangChain, CrewAI, etc.) that poll the harness and write results back.
