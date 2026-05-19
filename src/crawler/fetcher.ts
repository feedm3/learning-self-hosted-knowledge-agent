import PQueue from 'p-queue';

const USER_AGENT =
  'KissleggKnowledgeAgent/0.1 (self-hosted municipal RAG crawler)';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

// ok        — fetched successfully.
// gone      — server returned 404/410: the resource is confirmed deleted.
// error     — network failure, timeout, or non-gone error status (e.g. 5xx,
//             403). The resource may still exist; callers must NOT treat this
//             as a deletion.
export type FetchResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'gone'; status: number }
  | { kind: 'error'; reason: string };

// A polite HTTP client: at most 2 concurrent requests, one new request started
// per 500ms, retries on transient failures, and obeys robots.txt if present.
export class Fetcher {
  private readonly queue = new PQueue({
    concurrency: 2,
    interval: 500,
    intervalCap: 1,
  });
  private disallowedPrefixes: string[] = [];

  // Loads robots.txt once. Absent robots.txt ⇒ everything is allowed.
  async loadRobots(origin: string): Promise<void> {
    try {
      const res = await fetch(new URL('/robots.txt', origin), {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return;
      this.disallowedPrefixes = parseRobotsDisallow(await res.text());
    } catch {
      // No reachable robots.txt — treat as fully allowed.
    }
  }

  isAllowed(url: string): boolean {
    const path = new URL(url).pathname;
    return !this.disallowedPrefixes.some((prefix) => path.startsWith(prefix));
  }

  fetchPage(url: string): Promise<FetchResult<string>> {
    return this.run(url, async (res) => {
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        return { kind: 'error', reason: `not html (${contentType})` };
      }
      return { kind: 'ok', value: await res.text() };
    });
  }

  fetchPdf(url: string): Promise<FetchResult<Uint8Array>> {
    return this.run(url, async (res) => {
      return { kind: 'ok', value: new Uint8Array(await res.arrayBuffer()) };
    });
  }

  private async run<T>(
    url: string,
    onOk: (res: Response) => Promise<FetchResult<T>>,
  ): Promise<FetchResult<T>> {
    const result = await this.queue.add(async () => {
      let lastReason = 'unknown error';
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(url, {
            headers: { 'user-agent': USER_AGENT },
            redirect: 'follow',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (res.status === 404 || res.status === 410) {
            return { kind: 'gone', status: res.status } as FetchResult<T>;
          }
          if (res.ok) return await onOk(res);
          lastReason = `HTTP ${res.status}`;
          // Retry only on server errors; other 4xx are not transient.
          if (res.status < 500) return { kind: 'error', reason: lastReason };
        } catch (err) {
          lastReason = err instanceof Error ? err.message : String(err);
        }
        if (attempt < MAX_ATTEMPTS) {
          await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        }
      }
      return { kind: 'error', reason: lastReason } as FetchResult<T>;
    });
    return result as FetchResult<T>;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRobotsDisallow(robotsTxt: string): string[] {
  const disallowed: string[] = [];
  let appliesToUs = false;
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line.length === 0) continue;
    const [field, ...rest] = line.split(':');
    const key = field.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      appliesToUs = value === '*';
    } else if (key === 'disallow' && appliesToUs && value.length > 0) {
      disallowed.push(value);
    }
  }
  return disallowed;
}
