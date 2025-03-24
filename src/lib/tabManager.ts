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
    const now = Date.now();

    const allTabs = await chrome.tabs.query({});

    for (const tab of allTabs) {
      console.debug("Checking Tab:", tab.url);
      if (tab.pinned) {
        console.debug("Tab is pinned, skipping");
        continue;
      }
      const tabId = tab.id;
      if (!tabId) {
        console.debug("Tab has no id, skipping");
        continue;
      }

      const lastAccessedMs = this.lastAccessedMsById.get(tabId);
      if (lastAccessedMs === undefined) {
        console.debug("Tab has no last accessed time, skipping");
        this.updateLastAccessed(tabId);
        continue;
      }

      if (now - lastAccessedMs > timeoutMs) {
        chrome.tabs.remove(tabId);
      }
    }

    // TODO: clean up any tabs that no longer exist.
  }

  /**
   * Close all tabs excluding:
   * 1. Current tab
   * 2. Pinned tabs (browser feature)
   * 3. Locked tabs (TidyTabby feature)
   */
  public async closeAllTabs() {
    const currentTabIds = (
      await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
    )
      .map((tab) => tab.id)
      .filter((id) => id !== undefined);

    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.pinned) {
        continue;
      }
      if (tab.id === undefined) {
        continue;
      }
      if (currentTabIds.includes(tab.id)) {
        continue;
      }
      if (this.lockedTabs.has(tab.id)) {
        continue;
      }

      chrome.tabs.remove(tab.id);
    }
  }
}
