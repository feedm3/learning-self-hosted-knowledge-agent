import { cacheExists } from '../src/crawler/cache.ts';
import { ingestCrawlCache } from '../src/crawler/ingest.ts';
import { KISSLEGG } from '../src/crawler/site-config.ts';
import { printIngestReport, writeIngestReport } from '../src/crawler/report.ts';

if (!cacheExists()) {
  console.error('No crawl cache found. Run `pnpm run crawl:website` first.');
  process.exit(1);
}

const report = await ingestCrawlCache(KISSLEGG);
printIngestReport(report);
const file = await writeIngestReport(report);
console.log(`\nreport written to ${file}`);
