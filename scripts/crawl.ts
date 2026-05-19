import { crawlSite } from '../src/crawler/crawl.ts';
import { KISSLEGG } from '../src/crawler/site-config.ts';
import { printCrawlSummary } from '../src/crawler/report.ts';

const manifest = await crawlSite(KISSLEGG);
printCrawlSummary(manifest);
console.log(
  `\ncrawl cache written to ./crawl-cache (${manifest.entries.length} entries)`,
);
console.log('next: pnpm run ingest:website');
