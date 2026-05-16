import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Runs once before each integration test file (vitest isolates the module
// registry per file). Pointing CHUNKS_DB_URL at a throwaway LibSQL file before
// chunk-store.ts loads gives every scenario a clean, isolated vector index and
// never touches the real ./chunks.db.
//
// A temp file is used rather than ':memory:' — LibSQL's in-memory databases are
// not shared across the connections @mastra/libsql opens, so the vector table
// created by createIndex would be invisible to later queries.
const dir = mkdtempSync(path.join(tmpdir(), 'knowledge-agent-db-'));
process.env.CHUNKS_DB_URL = `file:${path.join(dir, 'chunks.db')}`;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
