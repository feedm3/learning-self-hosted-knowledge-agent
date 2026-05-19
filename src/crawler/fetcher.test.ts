import { describe, expect, it } from 'vitest';
import { parseRobotsDisallow } from './fetcher';

describe('parseRobotsDisallow', () => {
  it('collects Disallow paths under the wildcard user-agent', () => {
    const robots = `User-agent: *
Disallow: /intern/
Disallow: /tmp

User-agent: BadBot
Disallow: /`;
    expect(parseRobotsDisallow(robots)).toEqual(['/intern/', '/tmp']);
  });

  it('ignores comments and blank lines', () => {
    const robots = `# a comment
User-agent: *
Disallow: /private  # trailing comment`;
    expect(parseRobotsDisallow(robots)).toEqual(['/private']);
  });

  it('returns an empty list when nothing is disallowed', () => {
    expect(parseRobotsDisallow('User-agent: *\nAllow: /')).toEqual([]);
  });
});
