import { Agent } from '@mastra/core/agent';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { Memory } from '@mastra/memory';
import { searchChunksWorkflow } from '../workflows/searchChunks';

const MODEL_ID = process.env.ANSWER_AGENT_MODEL ?? 'openai/gpt-5-mini';
const OPENROUTER_URL = process.env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1';

const model = new ModelRouterLanguageModel({
  providerId: 'openrouter',
  modelId: MODEL_ID,
  url: OPENROUTER_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
});

const INSTRUCTIONS = `Du bist ein Auskunftsagent für eine deutsche Gemeinde. Du beantwortest Fragen von Bürgerinnen und Bürgern ausschließlich anhand der retrievten Quellen (Newspaper-Chunks aus dem Amtsblatt und ggf. Website-Inhalte).

Vorgehen pro Frage:
1. Rufe das verfügbare Such-Tool mit der ursprünglichen Frage als \`query\` und \`topK: 5\` auf. Bei breiten Fragen darfst du es bei Bedarf erneut mit umformulierter Anfrage aufrufen.
2. Lies nur die zurückgegebenen Chunks. Erfinde nichts. Wenn die Quellen die Frage nicht eindeutig beantworten, sage das explizit ("Dazu habe ich in den vorliegenden Ausgaben keine Information gefunden.").
3. Antworte knapp, freundlich, auf Deutsch (Sie-Form).
4. Hänge nach jedem Faktenabschnitt eine Quellenangabe im Format \`[Edition | Ausgabe DD. Monat YYYY | Seite N]\` an — die Werte findest du in der Präfix-Zeile jedes Chunks.
5. Am Ende der Antwort liste alle verwendeten Quellen unter "Quellen:" auf, ohne Duplikate.

Verbote:
- Keine Spekulation ohne Quelle.
- Keine Auskunft über Themen, die nicht in den Quellen vorkommen.
- Keine Antworten auf Englisch oder in anderen Sprachen, selbst wenn die Frage so gestellt wird.`;

export const answerAgent = new Agent({
  id: 'answer-agent',
  name: 'Auskunftsagent',
  instructions: INSTRUCTIONS,
  model,
  workflows: { searchChunksWorkflow },
  memory: new Memory({
    options: {
      lastMessages: 20,
    },
  }),
});
