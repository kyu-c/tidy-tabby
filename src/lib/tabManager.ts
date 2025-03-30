import { storageKeys } from "./chrome";

export type TabId = number;

export class TabManager {
  private lastAccessedMsById: Map<TabId, number> = new Map();
  private lockedTabs: Set<TabId> = new Set();

  constructor() {
    chrome.storage.local.get(storageKeys.lockedTabs).then((result) => {
      this.lockedTabs = new Set(result.lockedTabs);
    });
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
    chrome.storage.local.set({
      [storageKeys.lockedTabs]: Array.from(this.lockedTabs),
    });
  }

  public async handleRemovedTab(tabId: TabId) {
    this.lastAccessedMsById.delete(tabId);
    this.lockedTabs.delete(tabId);
  }

  public async cleanupInactiveTabs() {
    const { timeoutMinutes } = await chrome.storage.local.get(
      storageKeys.timeoutMinutes,
    );
    const timeoutMs = timeoutMinutes * 60 * 1000;
    console.debug(
      `[TabManager] Cleaning up inactive tabs with timeout ${timeoutMinutes}m`,
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

      const lastAccessedMs =
        tab.lastAccessed || this.lastAccessedMsById.get(tabId);
      if (lastAccessedMs === undefined) {
        console.debug("Tab has no last accessed time. Updating...");
        this.updateLastAccessed(tabId);
        continue;
      }
      const minutesSinceLastAccessed = (now - lastAccessedMs) / 60000;
      console.debug(
        `Tab ${tabId} has been inactive for ${minutesSinceLastAccessed}m`,
      );

      if (now - lastAccessedMs > timeoutMs) {
        chrome.tabs.remove(tabId);
      }
    }

    // TODO: clean up any tabs that no longer exist.
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
