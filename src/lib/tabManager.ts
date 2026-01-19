import { storageKeys } from "./chrome";
import {
  getEffectiveTimeoutMs,
  MAX_HISTORY_ENTRIES,
  pruneAccessHistory,
  pruneTimestamps,
} from "./smartTimeout";

export type TabId = number;

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

type AccessHistoryRecord = Record<string, number[]>;

export class TabManager {
  private lastAccessedMsById: Map<TabId, number> = new Map();
  private lockedTabs: Set<TabId> = new Set();
  private accessHistory: Map<string, number[]> = new Map();

  constructor() {
    chrome.storage.local.get([storageKeys.accessHistory]).then((result) => {
      const history: AccessHistoryRecord | undefined =
        result[storageKeys.accessHistory];
      if (history) {
        this.accessHistory = new Map(Object.entries(history));
      }
    });
  }

  private persistAccessHistory() {
    const historyObj: AccessHistoryRecord = Object.fromEntries(
      this.accessHistory,
    );
    chrome.storage.local.set({ [storageKeys.accessHistory]: historyObj });
  }

  private async persistLockedTabs() {
    const urls: string[] = [];
    for (const tabId of this.lockedTabs) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url) {
          urls.push(normalizeUrl(tab.url));
        }
      } catch {
        // Tab may no longer exist, skip it
      }
    }
    chrome.storage.local.set({ [storageKeys.lockedTabUrls]: urls });
  }

  public async restoreLockedTabs() {
    const result = await chrome.storage.local.get(storageKeys.lockedTabUrls);
    const lockedUrls: string[] = result[storageKeys.lockedTabUrls] || [];

    const urlCounts = new Map<string, number>();
    for (const url of lockedUrls) {
      urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
    }

    const allTabs = await chrome.tabs.query({});

    for (const tab of allTabs) {
      if (!tab.id || !tab.url) continue;
      const normalized = normalizeUrl(tab.url);
      const count = urlCounts.get(normalized);
      if (count && count > 0) {
        this.lockedTabs.add(tab.id);
        urlCounts.set(normalized, count - 1);
      }
    }

    await this.persistLockedTabs();
  }

  public recordAccess(url: string | undefined) {
    if (!url) return;

    const now = Date.now();
    const timestamps = this.accessHistory.get(url) || [];
    const validTimestamps = pruneTimestamps(timestamps, now);
    validTimestamps.push(now);

    this.accessHistory.set(url, validTimestamps);

    if (this.accessHistory.size > MAX_HISTORY_ENTRIES) {
      this.accessHistory = pruneAccessHistory(this.accessHistory, now);
    }

    this.persistAccessHistory();
  }

  public getEffectiveTimeout(url: string, baseTimeoutMs: number): number {
    return getEffectiveTimeoutMs(this.accessHistory.get(url), baseTimeoutMs);
  }

  public async getTimeRemainingMs(tabId: TabId): Promise<number | null> {
    const result = await chrome.storage.local.get([
      storageKeys.timeoutMinutes,
      storageKeys.smartTimeout,
      storageKeys.autoClose,
    ]);

    if (!result[storageKeys.autoClose]) {
      return null;
    }

    const tab = await chrome.tabs.get(tabId);
    if (tab.pinned || tab.active || tab.audible) {
      return null;
    }

    const baseTimeoutMs = result[storageKeys.timeoutMinutes] * 60 * 1000;
    const smartTimeoutEnabled = result[storageKeys.smartTimeout] === true;

    const lastAccessedMs =
      tab.lastAccessed || this.lastAccessedMsById.get(tabId);
    if (lastAccessedMs === undefined) {
      return null;
    }

    const effectiveTimeoutMs = smartTimeoutEnabled
      ? this.getEffectiveTimeout(tab.url || "", baseTimeoutMs)
      : baseTimeoutMs;

    const now = Date.now();
    const elapsed = now - lastAccessedMs;
    return Math.max(0, effectiveTimeoutMs - elapsed);
  }

  public getLockedTabs(): TabId[] {
    return Array.from(this.lockedTabs);
  }

  public async updateLastAccessed(tabId: TabId) {
    const tab = await chrome.tabs.get(tabId);
    this.lastAccessedMsById.set(tabId, Date.now());
    console.debug(`[TabManager] Updated tab ${tabId}`, tab);
  }

  public async updateLocked(tabId: TabId, locked: boolean) {
    if (locked) {
      this.lockedTabs.add(tabId);
    } else {
      this.lockedTabs.delete(tabId);
    }
    await this.persistLockedTabs();
  }

  public async handleRemovedTab(tabId: TabId) {
    this.lastAccessedMsById.delete(tabId);
    const wasLocked = this.lockedTabs.has(tabId);
    this.lockedTabs.delete(tabId);
    if (wasLocked) {
      await this.persistLockedTabs();
    }
  }

  public async cleanupInactiveTabs() {
    const result = await chrome.storage.local.get([
      storageKeys.timeoutMinutes,
      storageKeys.smartTimeout,
    ]);
    const baseTimeoutMs = result[storageKeys.timeoutMinutes] * 60 * 1000;
    const smartTimeoutEnabled = result[storageKeys.smartTimeout] === true;

    console.debug(
      `[TabManager] Cleaning up inactive tabs with base timeout ${result[storageKeys.timeoutMinutes]}m, smartTimeout=${smartTimeoutEnabled}`,
    );
    const now = Date.now();

    const allTabs = await chrome.tabs.query({});

    for (const tab of allTabs) {
      console.debug("Checking Tab:", tab.url);
      if (tab.pinned) {
        console.debug("Tab is pinned, skipping");
        continue;
      }

      if (tab.active) {
        console.debug("Tab is active, skipping");
        continue;
      }

      if (tab.audible) {
        console.debug("Tab is playing audio, skipping");
        continue;
      }

      const tabId = tab.id;
      if (!tabId) {
        console.debug("Tab has no id, skipping");
        continue;
      }

      if (this.lockedTabs.has(tabId)) {
        console.debug("Tab is locked, skipping");
        continue;
      }

      const lastAccessedMs =
        tab.lastAccessed || this.lastAccessedMsById.get(tabId);
      if (lastAccessedMs === undefined) {
        console.debug("Tab has no last accessed time. Updating...");
        this.updateLastAccessed(tabId);
        continue;
      }

      const effectiveTimeoutMs = smartTimeoutEnabled
        ? this.getEffectiveTimeout(tab.url || "", baseTimeoutMs)
        : baseTimeoutMs;

      const minutesSinceLastAccessed = (now - lastAccessedMs) / 60000;
      const effectiveTimeoutMinutes = effectiveTimeoutMs / 60000;
      console.debug(
        `Tab ${tabId} has been inactive for ${minutesSinceLastAccessed.toFixed(1)}m (effective timeout: ${effectiveTimeoutMinutes.toFixed(1)}m)`,
      );

      if (now - lastAccessedMs > effectiveTimeoutMs) {
        chrome.tabs.remove(tabId);
      }
    }
  }

  /**
   * Close all tabs excluding:
   * 1. Active tab
   * 2. Pinned tabs (browser feature)
   * 3. Audible tabs
   * 4. Locked tabs (TidyTabby feature)
   */
  public async closeAllTabs() {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.active) {
        continue;
      }
      if (tab.pinned) {
        continue;
      }
      if (tab.audible) {
        continue;
      }
      if (tab.id === undefined) {
        continue;
      }
      if (this.lockedTabs.has(tab.id)) {
        continue;
      }

      chrome.tabs.remove(tab.id);
    }
  }
}
