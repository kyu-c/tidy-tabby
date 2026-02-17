import { storageKeys } from "./chrome";
import { logger } from "./logger";
import {
  getEffectiveTimeoutMs,
  MAX_HISTORY_ENTRIES,
  pruneAccessHistory,
  pruneTimestamps,
} from "./smartTimeout";
import { isUrlExcluded, normalizeUrl } from "./urls";

export type TabId = number;

type AccessHistoryRecord = Record<string, number[]>;

export type TabTimeoutInfo = {
  timeRemainingMs: number | null;
  isExcluded: boolean;
};

export type TabManagerChromeApi = {
  storage: {
    local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    get(tabId: number): Promise<chrome.tabs.Tab>;
    query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
    remove(tabId: number): Promise<void>;
  };
};

export class TabManager {
  private lastAccessedMsById: Map<TabId, number> = new Map();
  private lockedTabs: Set<TabId> = new Set();
  private accessHistory: Map<string, number[]> = new Map();
  private tabUrls: Map<TabId, string> = new Map();
  private chromeApi: TabManagerChromeApi;
  private readyPromise: Promise<void>;

  constructor(chromeApi: TabManagerChromeApi = chrome) {
    this.chromeApi = chromeApi;
    this.readyPromise = this.loadAccessHistory();
  }

  private async loadAccessHistory(): Promise<void> {
    const result = await this.chromeApi.storage.local.get([
      storageKeys.accessHistory,
    ]);
    const history = result[storageKeys.accessHistory] as
      | AccessHistoryRecord
      | undefined;
    if (history) {
      this.accessHistory = new Map(Object.entries(history));
    }
  }

  public ready(): Promise<void> {
    return this.readyPromise;
  }

  private persistAccessHistory() {
    const historyObj: AccessHistoryRecord = Object.fromEntries(
      this.accessHistory,
    );
    this.chromeApi.storage.local.set({
      [storageKeys.accessHistory]: historyObj,
    });
  }

  private async persistLockedTabs() {
    const urls: string[] = [];
    for (const tabId of this.lockedTabs) {
      try {
        const tab = await this.chromeApi.tabs.get(tabId);
        if (tab.url) {
          urls.push(normalizeUrl(tab.url));
        }
      } catch {
        // Tab may no longer exist, skip it
      }
    }
    this.chromeApi.storage.local.set({ [storageKeys.lockedTabUrls]: urls });
  }

  public async restoreLockedTabs() {
    const result = await this.chromeApi.storage.local.get(
      storageKeys.lockedTabUrls,
    );
    const lockedUrls = (result[storageKeys.lockedTabUrls] || []) as string[];

    const urlCounts = new Map<string, number>();
    for (const url of lockedUrls) {
      urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
    }

    const allTabs = await this.chromeApi.tabs.query({});

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

  public async getTabTimeoutInfo(tabId: TabId): Promise<TabTimeoutInfo> {
    const result = await this.chromeApi.storage.local.get([
      storageKeys.timeoutMinutes,
      storageKeys.smartTimeout,
      storageKeys.autoClose,
      storageKeys.excludedPatterns,
    ]);

    if (!result[storageKeys.autoClose]) {
      return { timeRemainingMs: null, isExcluded: false };
    }

    const tab = await this.chromeApi.tabs.get(tabId);
    if (tab.pinned || tab.active || tab.audible) {
      return { timeRemainingMs: null, isExcluded: false };
    }

    const excludedPatterns = (result[storageKeys.excludedPatterns] ||
      []) as string[];
    if (isUrlExcluded(tab.url, excludedPatterns)) {
      return { timeRemainingMs: null, isExcluded: true };
    }

    const baseTimeoutMs =
      (result[storageKeys.timeoutMinutes] as number) * 60 * 1000;
    const smartTimeoutEnabled = result[storageKeys.smartTimeout] === true;

    const lastAccessedMs =
      tab.lastAccessed || this.lastAccessedMsById.get(tabId);
    if (lastAccessedMs === undefined) {
      return { timeRemainingMs: null, isExcluded: false };
    }

    const effectiveTimeoutMs = smartTimeoutEnabled
      ? this.getEffectiveTimeout(tab.url || "", baseTimeoutMs)
      : baseTimeoutMs;

    const now = Date.now();
    const elapsed = now - lastAccessedMs;
    return {
      timeRemainingMs: Math.max(0, effectiveTimeoutMs - elapsed),
      isExcluded: false,
    };
  }

  public getLockedTabs(): TabId[] {
    return Array.from(this.lockedTabs);
  }

  public async updateLastAccessed(tabId: TabId) {
    const tab = await this.chromeApi.tabs.get(tabId);
    this.lastAccessedMsById.set(tabId, Date.now());
    if (tab.url) {
      this.tabUrls.set(tabId, tab.url);
    }
    logger.debug(`[TabManager] Updated tab ${tabId}`, tab);
  }

  public async updateLocked(tabId: TabId, locked: boolean) {
    if (locked) {
      this.lockedTabs.add(tabId);
    } else {
      this.lockedTabs.delete(tabId);
    }
    await this.persistLockedTabs();
  }

  public async handleRemovedTab(tabId: TabId, isWindowClosing: boolean) {
    const url = this.tabUrls.get(tabId);
    this.lastAccessedMsById.delete(tabId);
    this.tabUrls.delete(tabId);
    const wasLocked = this.lockedTabs.has(tabId);
    this.lockedTabs.delete(tabId);
    if (wasLocked) {
      await this.persistLockedTabs();
    }

    const isManualClose = !isWindowClosing;

    if (isManualClose && url) {
      const normalizedUrl = normalizeUrl(url);
      this.accessHistory.delete(normalizedUrl);
      this.persistAccessHistory();
      logger.debug(
        `[TabManager] Cleared access history for manually closed tab: ${normalizedUrl}`,
      );
    }
  }

  public async cleanupInactiveTabs() {
    const result = await this.chromeApi.storage.local.get([
      storageKeys.timeoutMinutes,
      storageKeys.smartTimeout,
      storageKeys.excludedPatterns,
    ]);
    const baseTimeoutMs =
      (result[storageKeys.timeoutMinutes] as number) * 60 * 1000;
    const smartTimeoutEnabled = result[storageKeys.smartTimeout] === true;
    const excludedPatterns = (result[storageKeys.excludedPatterns] ||
      []) as string[];

    logger.debug(
      `[TabManager] Cleaning up inactive tabs with base timeout ${result[storageKeys.timeoutMinutes]}m, smartTimeout=${smartTimeoutEnabled}`,
    );
    const now = Date.now();

    const allTabs = await this.chromeApi.tabs.query({});

    for (const tab of allTabs) {
      logger.debug("Checking Tab:", tab.url);
      if (tab.pinned) {
        logger.debug("Tab is pinned, skipping");
        continue;
      }

      if (tab.active) {
        logger.debug("Tab is active, skipping");
        continue;
      }

      if (tab.audible) {
        logger.debug("Tab is playing audio, skipping");
        continue;
      }

      const tabId = tab.id;
      if (!tabId) {
        logger.debug("Tab has no id, skipping");
        continue;
      }

      if (this.lockedTabs.has(tabId)) {
        logger.debug("Tab is locked, skipping");
        continue;
      }

      if (isUrlExcluded(tab.url, excludedPatterns)) {
        logger.debug("Tab URL matches excluded pattern, skipping");
        continue;
      }

      const lastAccessedMs =
        tab.lastAccessed || this.lastAccessedMsById.get(tabId);
      if (lastAccessedMs === undefined) {
        logger.debug("Tab has no last accessed time. Updating...");
        this.updateLastAccessed(tabId);
        continue;
      }

      const effectiveTimeoutMs = smartTimeoutEnabled
        ? this.getEffectiveTimeout(tab.url || "", baseTimeoutMs)
        : baseTimeoutMs;

      const minutesSinceLastAccessed = (now - lastAccessedMs) / 60000;
      const effectiveTimeoutMinutes = effectiveTimeoutMs / 60000;
      logger.debug(
        `Tab ${tabId} has been inactive for ${minutesSinceLastAccessed.toFixed(1)}m (effective timeout: ${effectiveTimeoutMinutes.toFixed(1)}m)`,
      );

      if (now - lastAccessedMs > effectiveTimeoutMs) {
        this.chromeApi.tabs.remove(tabId);
      }
    }
  }

  /**
   * Close all tabs excluding:
   * 1. Active tab
   * 2. Pinned tabs (browser feature)
   * 3. Audible tabs
   * 4. Locked tabs (TidyTabby feature)
   * 5. Tabs matching excluded URL patterns
   */
  public async closeAllTabs() {
    const result = await this.chromeApi.storage.local.get([
      storageKeys.excludedPatterns,
    ]);
    const excludedPatterns = (result[storageKeys.excludedPatterns] ||
      []) as string[];

    const allTabs = await this.chromeApi.tabs.query({});
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
      if (isUrlExcluded(tab.url, excludedPatterns)) {
        continue;
      }

      this.chromeApi.tabs.remove(tab.id);
    }
  }
}
