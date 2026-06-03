import { glob } from 'node:fs/promises';
import path from 'node:path';
import { mastra } from '../src/mastra/index.ts';

// Ingests one or more newspaper PDF editions into the combined chunk index by
// driving the existing `ingestPdfWorkflow` (parse → column-sort → chunk → embed
// → upsert). Re-running an edition replaces its chunks rather than duplicating —
// the workflow's storage tail keys on document_url. Needs Ollama up for
// embeddings (`pnpm run infra:dev`), same as `ingest:website`.
//
// All newspaper metadata (published_at, document_title, edition_no) is derived
// by the workflow from the filename via parseDocumentMetadata; the script only
// supplies file paths. edition_no stays null — the filename encodes a date, not
// an edition number.

const SAMPLES_GLOB = 'docs/newspaper-samples/*.pdf';

async function resolveFilePaths(args: string[]): Promise<string[]> {
  if (args.length > 0) {
    return args.map((arg) => path.resolve(arg));
  }
  const matches: string[] = [];
  for await (const match of glob(SAMPLES_GLOB)) {
    matches.push(path.resolve(match));
  }
  matches.sort();
  return matches;
}

const filePaths = await resolveFilePaths(process.argv.slice(2));

if (filePaths.length === 0) {
  console.error(`No PDFs given and none matched ${SAMPLES_GLOB}.`);
  process.exit(1);
}

const workflow = mastra.getWorkflow('ingestPdfWorkflow');

let failures = 0;

for (const filePath of filePaths) {
  const filename = path.basename(filePath);
  console.log(`ingesting ${filename} …`);
  try {
    const run = await workflow.createRun();
    const result = await run.start({ inputData: { filePath } });

    if (result.status !== 'success') {
      failures++;
      const reason =
        result.status === 'failed'
          ? result.error instanceof Error
            ? result.error.message
            : result.error
          : result.status;
      console.error(`  failed: ${reason}`);
      continue;
    }

    const { document_url, chunk_count, page_date_warning } = result.result;
    console.log(`  ok: ${chunk_count} chunks → ${document_url}`);
    if (page_date_warning) {
      console.warn(`  warning: ${page_date_warning}`);
    }
  } catch (err) {
    failures++;
    console.error(`  failed: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(
  `\ndone: ${filePaths.length - failures}/${filePaths.length} editions ingested`,
);

if (failures > 0) {
  process.exit(1);
}
