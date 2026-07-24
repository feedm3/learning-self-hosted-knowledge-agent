// Extracts the chunks the answer agent ACTUALLY retrieved from a `generate()`
// result, so the generation eval (and the case dump for manual judging) score
// faithfulness against the same context the agent saw — not a fresh search.
//
// The agent registers `searchChunksWorkflow`, so Mastra exposes it as the tool
// `workflow-searchChunksWorkflow`, whose result is `{ hits }`. Re-running search
// instead would let a real hallucination pass (or flag a grounded claim as
// unsupported) by judging against chunks the agent never saw.

import { z } from 'zod';

const SEARCH_TOOL_NAME = 'workflow-searchChunksWorkflow';

// Lean shape: we only need `id` (to dedup across multiple tool-calls) and
// `text` (the judge context). `passthrough()` tolerates the other hit fields.
const hitsEnvelope = z.object({
  hits: z.array(z.object({ id: z.string(), text: z.string() }).passthrough()),
});

// The workflow tool returns `{ hits }`; tolerate one extra wrapper layer
// without hard-coding a shape, so a Mastra version bump that nests the result
// doesn't silently zero out the context.
function unwrapHits(value: unknown): { id: string; text: string }[] {
  for (const candidate of [value, (value as { result?: unknown } | null)?.result]) {
    const parsed = hitsEnvelope.safeParse(candidate);
    if (parsed.success) return parsed.data.hits;
  }
  return [];
}

// Collect the chunks the agent retrieved across all its search tool-calls,
// deduped by id, preserving the first (best-ranked) occurrence.
export function retrievedContext(toolResults: unknown): string[] {
  if (!Array.isArray(toolResults)) return [];
  const byId = new Map<string, string>();
  let sawSearchCall = false;
  for (const chunk of toolResults) {
    const payload = (chunk as { payload?: { toolName?: string; result?: unknown } } | null)
      ?.payload;
    if (!payload || payload.toolName !== SEARCH_TOOL_NAME) continue;
    sawSearchCall = true;
    for (const hit of unwrapHits(payload.result)) {
      if (!byId.has(hit.id)) byId.set(hit.id, hit.text);
    }
  }
  // Surface a shape drift loudly: a search call that yields no extractable hits
  // means the tool-result shape changed — don't silently judge against empty
  // context and crater faithfulness.
  if (sawSearchCall && byId.size === 0) {
    console.warn(
      '[retrieved-context] search tool-call found but no hits extracted — check tool-result shape',
    );
  }
  return [...byId.values()];
}
