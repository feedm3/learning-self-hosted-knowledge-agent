import { parseDocumentMetadata, checkDateAgainstPageOne } from '../src/mastra/lib/metadata.ts';
import { parsePdf } from '../src/mastra/lib/pdf-parser.ts';
import { orderPage } from '../src/mastra/lib/column-sort.ts';
import { chunkDocument } from '../src/mastra/lib/chunker.ts';

const filePath = process.argv[2] ?? './docs/newspaper-samples/25-04-2026-der-kisslegger.pdf';

const meta = parseDocumentMetadata(filePath);
console.log('meta:', meta);

const parsed = await parsePdf(filePath);
console.log(`pages: ${parsed.pages.length}`);

const ordered = parsed.pages.map(orderPage);

const page1Text = ordered[0].paragraphs.map((p) => p.text).join('\n');
const dateCheck = checkDateAgainstPageOne(meta.published_at, page1Text);
console.log('page-1 date check:', dateCheck);

const chunks = chunkDocument(ordered, meta);
console.log(`chunk count: ${chunks.length}`);
console.log(`chunks per page:`,
  chunks.reduce<Record<number, number>>((acc, c) => {
    acc[c.page_number] = (acc[c.page_number] ?? 0) + 1;
    return acc;
  }, {}),
);

// Parcel-string preservation check (page 3 "Bärenweiler")
const parcelMatch = chunks.some((c) =>
  c.page_number === 3 && /1167\/4[^\d].*1167\/8/s.test(c.text),
);
console.log(`page-3 parcel string present: ${parcelMatch}`);

// Spot-check: print first chunk of page 2
const page2First = chunks.find((c) => c.page_number === 2);
if (page2First) {
  console.log('\n--- first chunk of page 2 ---');
  console.log(page2First.text.slice(0, 800));
  console.log('---');
}

// Spot-check: a chunk that contains "Bürgerhaus Löwen"
const buergerhaus = chunks.find((c) => /Bürgerhaus Löwen/.test(c.text));
if (buergerhaus) {
  console.log(`\nBürgerhaus Löwen chunk: page ${buergerhaus.page_number}, idx ${buergerhaus.chunk_index}`);
  console.log(buergerhaus.text.slice(0, 600));
}
