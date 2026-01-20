export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin === "null") {
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function isUrlExcluded(
  url: string | undefined,
  patterns: string[],
): boolean {
  if (!url || patterns.length === 0) return false;
  return patterns.some((pattern) => url.includes(pattern));
}
