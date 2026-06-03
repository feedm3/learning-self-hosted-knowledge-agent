// LLM-as-judge for the generation eval. Scores faithfulness and completeness,
// and classifies language and refusal. One judge call per query returns every
// LLM-derived score so the Evalite scorers stay pure field reads. See ADR 0006.
//
// The judge runs offline against Kißlegg example data, so it is not the runtime
// retrieval path — a cloud model is DSGVO-permissible here (see ADR 0001).

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'google/gemini-3.1-flash-lite';
const OPENROUTER_URL = process.env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1';

export interface JudgeResult {
  // Fraction of factual claims in the answer supported by the retrieved context.
  faithfulness: number;
  // Fraction of the query's expected facts present in the answer.
  completeness: number;
  // Whether the answer is written entirely in German.
  language: 'de' | 'other';
  // Whether the answer declines to answer for lack of information in the sources.
  refused: boolean;
  reason: string;
}

export interface JudgeInput {
  query: string;
  answer: string;
  contextChunks: string[];
  expectedFacts: string[];
  mustRefuse: boolean;
}

const SYSTEM = `You are a strict evaluator for a German municipal Q&A assistant.
You judge one answer at a time and reply ONLY with a JSON object — no prose.

The JSON object must have exactly these keys:
- "faithfulness": number 0..1. Of the factual claims the ANSWER makes, the fraction
  directly supported by the RETRIEVED CONTEXT. If the answer makes no factual
  claims (e.g. it is a refusal or a clarifying question), return 1.
- "completeness": number 0..1. Of the EXPECTED FACTS listed, the fraction that are
  stated (in meaning, paraphrase is fine) in the ANSWER. If no expected facts are
  listed, return 1.
- "language": "de" if the answer is written entirely in German, otherwise "other".
- "refused": true if the answer declines to answer because the information is not
  in the available sources (e.g. "Dazu habe ich in den vorliegenden Quellen keine
  Information gefunden"); false if it attempts a substantive answer.
- "reason": one short sentence justifying the scores.`;

function buildUserPrompt(input: JudgeInput): string {
  const context = input.contextChunks.length
    ? input.contextChunks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
    : '(no context retrieved)';
  const facts = input.expectedFacts.length
    ? input.expectedFacts.map((f) => `- ${f}`).join('\n')
    : '(none — this query should be refused)';
  return `QUERY:
${input.query}

RETRIEVED CONTEXT:
${context}

EXPECTED FACTS:
${facts}

ANSWER:
${input.answer || '(empty answer)'}`;
}

export async function judgeAnswer(input: JudgeInput): Promise<JudgeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set — the eval judge needs it.');
  }

  const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Judge request failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('Judge returned no content.');

  const parsed = parseJudgeJson(content);
  return {
    faithfulness: clamp01(parsed.faithfulness),
    completeness: clamp01(parsed.completeness),
    language: parsed.language === 'de' ? 'de' : 'other',
    refused: parsed.refused === true,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

// `response_format: json_object` is not honoured by every OpenRouter model —
// some wrap the object in ```json fences or add prose. Strip fences and fall
// back to the first {...} block before parsing, so a cosmetically-formatted
// reply doesn't crash the whole eval case.
function parseJudgeJson(content: string): Partial<JudgeResult> {
  const cleaned = content
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Partial<JudgeResult>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Partial<JudgeResult>;
    throw new Error(`Judge returned non-JSON content: ${content.slice(0, 200)}`);
  }
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
