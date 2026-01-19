import { describe, it, expect } from "vitest";
import {
  getWeightedAccessCount,
  getEffectiveTimeoutMs,
  pruneTimestamps,
  pruneAccessHistory,
  MAX_HISTORY_AGE_MS,
  MAX_HISTORY_ENTRIES,
  MAX_TIMEOUT_MS,
  DECAY_LAMBDA,
} from "./smartTimeout";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const BASE_TIMEOUT_MS = 30 * MS_PER_MINUTE; // 30 minutes

describe("getWeightedAccessCount", () => {
  it("returns 0 for empty timestamps", () => {
    const now = Date.now();
    expect(getWeightedAccessCount([], now)).toEqual(0);
  });

  it("returns ~1 for a single access just now", () => {
    const now = Date.now();
    const count = getWeightedAccessCount([now], now);
    expect(count).toBeCloseTo(1, 5);
  });

  it("decays access weight over time", () => {
    const now = Date.now();
    const oneDayAgo = now - MS_PER_DAY;
    const twoDaysAgo = now - 2 * MS_PER_DAY;

    const countNow = getWeightedAccessCount([now], now);
    const countOneDayAgo = getWeightedAccessCount([oneDayAgo], now);
    const countTwoDaysAgo = getWeightedAccessCount([twoDaysAgo], now);

    expect(countNow).toBeGreaterThan(countOneDayAgo);
    expect(countOneDayAgo).toBeGreaterThan(countTwoDaysAgo);
  });

  it("has half-life of approximately 2 days", () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * MS_PER_DAY;

    const countNow = getWeightedAccessCount([now], now);
    const countTwoDaysAgo = getWeightedAccessCount([twoDaysAgo], now);

    // With lambda = 0.35, half-life = ln(2) / 0.35 ≈ 1.98 days
    const expectedHalfLife = Math.log(2) / DECAY_LAMBDA;
    expect(expectedHalfLife).toBeCloseTo(2, 0);
    expect(countTwoDaysAgo / countNow).toBeCloseTo(0.5, 1);
  });

  it("sums weights for multiple accesses", () => {
    const now = Date.now();
    const timestamps = [now, now - MS_PER_DAY, now - 2 * MS_PER_DAY];

    const count = getWeightedAccessCount(timestamps, now);

    // Should be sum of individual weights
    const expected =
      Math.exp(-DECAY_LAMBDA * 0) +
      Math.exp(-DECAY_LAMBDA * 1) +
      Math.exp(-DECAY_LAMBDA * 2);
    expect(count).toBeCloseTo(expected, 5);
  });

  it("returns very small weight for week-old access", () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * MS_PER_DAY;

    const count = getWeightedAccessCount([sevenDaysAgo], now);
    expect(count).toBeLessThan(0.1);
  });
});

describe("getEffectiveTimeoutMs", () => {
  it("returns base timeout for undefined timestamps", () => {
    const timeout = getEffectiveTimeoutMs(undefined, BASE_TIMEOUT_MS);
    expect(timeout).toEqual(BASE_TIMEOUT_MS);
  });

  it("returns base timeout for empty timestamps", () => {
    const timeout = getEffectiveTimeoutMs([], BASE_TIMEOUT_MS);
    expect(timeout).toEqual(BASE_TIMEOUT_MS);
  });

  it("increases timeout for single recent access", () => {
    const now = Date.now();
    const timeout = getEffectiveTimeoutMs([now], BASE_TIMEOUT_MS, now);

    // multiplier = 1 + log2(1 + 1) = 1 + 1 = 2
    expect(timeout).toBeCloseTo(BASE_TIMEOUT_MS * 2, 0);
  });

  it("increases timeout with diminishing returns (logarithmic)", () => {
    const now = Date.now();

    // 1 access: multiplier = 1 + log2(2) = 2
    const timeout1 = getEffectiveTimeoutMs([now], BASE_TIMEOUT_MS, now);

    // 3 accesses: multiplier = 1 + log2(4) = 3
    const timeout3 = getEffectiveTimeoutMs(
      [now, now, now],
      BASE_TIMEOUT_MS,
      now,
    );

    // 7 accesses: multiplier = 1 + log2(8) = 4
    const timeout7 = getEffectiveTimeoutMs(
      Array(7).fill(now),
      BASE_TIMEOUT_MS,
      now,
    );

    // Verify logarithmic scaling
    expect(timeout1).toBeCloseTo(BASE_TIMEOUT_MS * 2, 0);
    expect(timeout3).toBeCloseTo(BASE_TIMEOUT_MS * 3, 0);
    expect(timeout7).toBeCloseTo(BASE_TIMEOUT_MS * 4, 0);

    // Verify diminishing returns: each doubling of accesses adds same amount
    const diff1to3 = timeout3 - timeout1;
    const diff3to7 = timeout7 - timeout3;
    expect(diff1to3).toBeCloseTo(diff3to7, 0);
  });

  it("caps timeout at MAX_TIMEOUT_MS (30 days)", () => {
    const now = Date.now();
    // Use a large base timeout that would exceed max when multiplied
    const largeBaseTimeout = 10 * MS_PER_DAY; // 10 days
    const manyAccesses = Array(1000).fill(now);

    const timeout = getEffectiveTimeoutMs(manyAccesses, largeBaseTimeout, now);
    expect(timeout).toEqual(MAX_TIMEOUT_MS);
  });

  it("reduces effective timeout as accesses age", () => {
    const now = Date.now();

    // 10 accesses today
    const timeoutToday = getEffectiveTimeoutMs(
      Array(10).fill(now),
      BASE_TIMEOUT_MS,
      now,
    );

    // Same 10 accesses, but 2 days later
    const twoDaysLater = now + 2 * MS_PER_DAY;
    const timeoutLater = getEffectiveTimeoutMs(
      Array(10).fill(now),
      BASE_TIMEOUT_MS,
      twoDaysLater,
    );

    expect(timeoutLater).toBeLessThan(timeoutToday);

    // Verify timeout continues decreasing as accesses age further
    const sevenDaysLater = now + 7 * MS_PER_DAY;
    const timeoutMuchLater = getEffectiveTimeoutMs(
      Array(10).fill(now),
      BASE_TIMEOUT_MS,
      sevenDaysLater,
    );

    expect(timeoutMuchLater).toBeLessThan(timeoutLater);
    // After 7 days, should be significantly reduced from peak
    expect(timeoutMuchLater / timeoutToday).toBeLessThan(0.5);
  });

  it("handles documentation tab scenario: 10 accesses yesterday", () => {
    const now = Date.now();
    const yesterday = now - MS_PER_DAY;

    // 10 accesses yesterday, none today
    const timestamps = Array(10).fill(yesterday);
    const timeout = getEffectiveTimeoutMs(timestamps, BASE_TIMEOUT_MS, now);

    // Should still have significant timeout extension
    expect(timeout).toBeGreaterThan(BASE_TIMEOUT_MS * 2);
    expect(timeout).toBeLessThan(BASE_TIMEOUT_MS * 5);
  });
});

describe("pruneTimestamps", () => {
  it("keeps recent timestamps", () => {
    const now = Date.now();
    const timestamps = [now, now - MS_PER_DAY, now - 3 * MS_PER_DAY];

    const pruned = pruneTimestamps(timestamps, now);
    expect(pruned).toHaveLength(3);
  });

  it("removes timestamps older than 7 days", () => {
    const now = Date.now();
    const timestamps = [
      now,
      now - 6 * MS_PER_DAY, // 6 days ago - keep
      now - 8 * MS_PER_DAY, // 8 days ago - remove
    ];

    const pruned = pruneTimestamps(timestamps, now);
    expect(pruned).toHaveLength(2);
    expect(pruned).not.toContain(timestamps[2]);
  });

  it("returns empty array when all timestamps are too old", () => {
    const now = Date.now();
    const timestamps = [
      now - 8 * MS_PER_DAY,
      now - 10 * MS_PER_DAY,
      now - 14 * MS_PER_DAY,
    ];

    const pruned = pruneTimestamps(timestamps, now);
    expect(pruned).toHaveLength(0);
  });
});

describe("pruneAccessHistory", () => {
  it("removes URLs with only old timestamps", () => {
    const now = Date.now();
    const history = new Map<string, number[]>([
      ["https://recent.com", [now]],
      ["https://old.com", [now - 8 * MS_PER_DAY]],
    ]);

    const pruned = pruneAccessHistory(history, now);
    expect(pruned.has("https://recent.com")).toEqual(true);
    expect(pruned.has("https://old.com")).toEqual(false);
  });

  it("keeps URLs with at least one recent timestamp", () => {
    const now = Date.now();
    const history = new Map<string, number[]>([
      ["https://mixed.com", [now, now - 8 * MS_PER_DAY]],
    ]);

    const pruned = pruneAccessHistory(history, now);
    expect(pruned.has("https://mixed.com")).toEqual(true);
    expect(pruned.get("https://mixed.com")).toHaveLength(1);
  });

  it("evicts lowest-value URLs when over MAX_HISTORY_ENTRIES", () => {
    const now = Date.now();
    const history = new Map<string, number[]>();

    // Create more entries than allowed
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 100; i++) {
      // Give different access counts to create varying values
      const accessCount = i % 10 === 0 ? 5 : 1;
      history.set(
        `https://example${i}.com`,
        Array(accessCount).fill(now - MS_PER_DAY),
      );
    }

    const pruned = pruneAccessHistory(history, now);
    expect(pruned.size).toEqual(MAX_HISTORY_ENTRIES);
  });

  it("keeps highest-value URLs when evicting", () => {
    const now = Date.now();
    const history = new Map<string, number[]>();

    // Create entries over limit
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 10; i++) {
      history.set(`https://low${i}.com`, [now - 3 * MS_PER_DAY]); // Low value
    }
    // Add high-value URLs
    history.set("https://high-value.com", Array(20).fill(now)); // High value

    const pruned = pruneAccessHistory(history, now);
    expect(pruned.has("https://high-value.com")).toEqual(true);
  });
});

describe("constants", () => {
  it("MAX_HISTORY_AGE_MS is 7 days", () => {
    expect(MAX_HISTORY_AGE_MS).toEqual(7 * MS_PER_DAY);
  });

  it("MAX_TIMEOUT_MS is 30 days", () => {
    expect(MAX_TIMEOUT_MS).toEqual(30 * MS_PER_DAY);
  });

  it("MAX_HISTORY_ENTRIES is 500", () => {
    expect(MAX_HISTORY_ENTRIES).toEqual(500);
  });
});
