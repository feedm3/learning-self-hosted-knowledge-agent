import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolves embedded-DB files to `<project-root>/data/` so every process opens
// the same file. The ingest script and the Mastra dev server run with
// different working directories, so a cwd-relative `./x.db` would resolve to
// separate databases. The root is the dir holding both package.json and
// pnpm-lock.yaml (the lockfile is absent from any bundled build output).
let cachedDir: string | undefined;

function dataDir(): string {
  if (cachedDir) return cachedDir;
  let dir = process.cwd();
  for (;;) {
    if (
      existsSync(join(dir, 'package.json')) &&
      existsSync(join(dir, 'pnpm-lock.yaml'))
    ) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedDir = join(dir, 'data');
  mkdirSync(cachedDir, { recursive: true });
  return cachedDir;
}

// Absolute filesystem path, e.g. for DuckDB whose config takes a bare path.
export function dataFilePath(fileName: string): string {
  return join(dataDir(), fileName);
}

// `file:` URL form, e.g. for LibSQL whose config takes a connection URL.
export function dataFileUrl(fileName: string): string {
  return pathToFileURL(dataFilePath(fileName)).href;
}
