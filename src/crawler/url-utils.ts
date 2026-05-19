// decodeURIComponent that leaves malformed percent-escapes untouched instead of
// throwing — crawled URLs occasionally carry broken encodings.
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
