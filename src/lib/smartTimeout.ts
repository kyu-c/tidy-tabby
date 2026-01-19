const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MAX_HISTORY_AGE_MS = 7 * MS_PER_DAY;
export const MAX_HISTORY_ENTRIES = 500;
export const MAX_TIMEOUT_MS = 30 * MS_PER_DAY;
export const DECAY_LAMBDA = 0.35;

export function getWeightedAccessCount(
  timestamps: number[],
  now: number = Date.now(),
): number {
  let weightedCount = 0;

  for (const timestamp of timestamps) {
    const daysSinceAccess = (now - timestamp) / MS_PER_DAY;
    weightedCount += Math.exp(-DECAY_LAMBDA * daysSinceAccess);
  }

  return weightedCount;
}

export function getEffectiveTimeoutMs(
  timestamps: number[] | undefined,
  baseTimeoutMs: number,
  now: number = Date.now(),
): number {
  if (!timestamps || timestamps.length === 0) {
    return baseTimeoutMs;
  }

  const weightedCount = getWeightedAccessCount(timestamps, now);
  const multiplier = 1 + Math.log2(1 + weightedCount);
  const effectiveTimeout = baseTimeoutMs * multiplier;

  return Math.min(effectiveTimeout, MAX_TIMEOUT_MS);
}

export function pruneTimestamps(
  timestamps: number[],
  now: number = Date.now(),
): number[] {
  return timestamps.filter((t) => now - t < MAX_HISTORY_AGE_MS);
}

export function pruneAccessHistory(
  accessHistory: Map<string, number[]>,
  now: number = Date.now(),
): Map<string, number[]> {
  const pruned = new Map<string, number[]>();

  for (const [url, timestamps] of accessHistory) {
    const validTimestamps = pruneTimestamps(timestamps, now);
    if (validTimestamps.length > 0) {
      pruned.set(url, validTimestamps);
    }
  }

  if (pruned.size > MAX_HISTORY_ENTRIES) {
    const urlsByValue = [...pruned.entries()]
      .map(([url, timestamps]) => ({
        url,
        value: getWeightedAccessCount(timestamps, now),
      }))
      .sort((a, b) => a.value - b.value);

    const toRemove = urlsByValue.slice(0, pruned.size - MAX_HISTORY_ENTRIES);
    for (const { url } of toRemove) {
      pruned.delete(url);
    }
  }

  return pruned;
}
