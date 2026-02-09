import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storageKeys } from "./chrome";
import { TabManager, type TabManagerChromeApi } from "./tabManager";

const MS_PER_MINUTE = 60 * 1000;

function makeTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    id: 1,
    index: 0,
    pinned: false,
    highlighted: false,
    windowId: 1,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    groupId: -1,
    url: "https://example.com/page",
    ...overrides,
  };
}

type StorageData = Record<string, unknown>;

function createMockChromeApi(
  options: { storage?: StorageData; tabs?: chrome.tabs.Tab[] } = {},
): {
  chromeApi: TabManagerChromeApi;
  storage: StorageData;
  removedTabIds: number[];
  storageSets: StorageData[];
} {
  const storage: StorageData = { ...options.storage };
  const tabs = options.tabs || [];
  const removedTabIds: number[] = [];
  const storageSets: StorageData[] = [];

  const chromeApi: TabManagerChromeApi = {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const keyArray = Array.isArray(keys) ? keys : [keys];
          const result: StorageData = {};
          for (const key of keyArray) {
            if (key in storage) {
              result[key] = storage[key];
            }
          }
          return result;
        }),
        set: vi.fn(async (items: StorageData) => {
          Object.assign(storage, items);
          storageSets.push({ ...items });
        }),
      },
    },
    tabs: {
      get: vi.fn(async (tabId: number) => {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) throw new Error(`No tab with id ${tabId}`);
        return tab;
      }),
      query: vi.fn(async () => [...tabs]),
      remove: vi.fn(async (tabId: number) => {
        removedTabIds.push(tabId);
      }),
    },
  };

  return { chromeApi, storage, removedTabIds, storageSets };
}

async function createTabManager(
  options: Parameters<typeof createMockChromeApi>[0] = {},
) {
  const mock = createMockChromeApi(options);
  const manager = new TabManager(mock.chromeApi);
  await manager.ready();
  return { manager, ...mock };
}

describe("TabManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initialization", () => {
    it("loads access history from storage on construction", async () => {
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.accessHistory]: {
            "https://example.com": [Date.now() - 1000],
          },
        },
      });

      const timeout = manager.getEffectiveTimeout(
        "https://example.com",
        30 * MS_PER_MINUTE,
      );
      expect(timeout).toEqual(30 * MS_PER_MINUTE);
    });

    it("works with no prior access history in storage", async () => {
      const { manager } = await createTabManager();

      const timeout = manager.getEffectiveTimeout(
        "https://example.com",
        30 * MS_PER_MINUTE,
      );
      expect(timeout).toEqual(30 * MS_PER_MINUTE);
    });
  });

  describe("recordAccess", () => {
    it("ignores undefined url", async () => {
      const { manager, storage } = await createTabManager();

      manager.recordAccess(undefined);

      expect(storage[storageKeys.accessHistory]).toEqual(undefined);
    });

    it("persists access history to storage", async () => {
      const { manager, storage } = await createTabManager();

      manager.recordAccess("https://example.com");

      const persisted = storage[storageKeys.accessHistory] as Record<
        string,
        number[]
      >;
      expect(persisted["https://example.com"]).toHaveLength(1);
      expect(persisted["https://example.com"][0]).toEqual(Date.now());
    });

    it("accumulates multiple accesses for same url", async () => {
      const { manager, storage } = await createTabManager();

      manager.recordAccess("https://example.com");
      vi.advanceTimersByTime(1000);
      manager.recordAccess("https://example.com");

      const persisted = storage[storageKeys.accessHistory] as Record<
        string,
        number[]
      >;
      expect(persisted["https://example.com"]).toHaveLength(2);
    });

    it("prunes timestamps older than 7 days", async () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const { manager, storage } = await createTabManager({
        storage: {
          [storageKeys.accessHistory]: {
            "https://example.com": [eightDaysAgo],
          },
        },
      });

      manager.recordAccess("https://example.com");

      const persisted = storage[storageKeys.accessHistory] as Record<
        string,
        number[]
      >;
      expect(persisted["https://example.com"]).toHaveLength(1);
      expect(persisted["https://example.com"][0]).toEqual(Date.now());
    });
  });

  describe("getEffectiveTimeout", () => {
    it("returns base timeout when no history exists for url", async () => {
      const { manager } = await createTabManager();

      expect(
        manager.getEffectiveTimeout("https://unknown.com", 30 * MS_PER_MINUTE),
      ).toEqual(30 * MS_PER_MINUTE);
    });

    it("increases timeout for frequently accessed urls", async () => {
      const { manager } = await createTabManager();

      for (let i = 0; i < 5; i++) {
        manager.recordAccess("https://frequent.com");
      }

      const timeout = manager.getEffectiveTimeout(
        "https://frequent.com",
        30 * MS_PER_MINUTE,
      );
      expect(timeout).toBeGreaterThan(30 * MS_PER_MINUTE);
    });
  });

  describe("getTabTimeoutInfo", () => {
    it("returns null timeRemaining when autoClose is disabled", async () => {
      const { manager } = await createTabManager({
        storage: { [storageKeys.autoClose]: false },
        tabs: [makeTab({ id: 1 })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info).toEqual({ timeRemainingMs: null, isExcluded: false });
    });

    it("returns null timeRemaining for pinned tabs", async () => {
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
        },
        tabs: [makeTab({ id: 1, pinned: true })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info).toEqual({ timeRemainingMs: null, isExcluded: false });
    });

    it("returns null timeRemaining for active tabs", async () => {
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
        },
        tabs: [makeTab({ id: 1, active: true })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info).toEqual({ timeRemainingMs: null, isExcluded: false });
    });

    it("returns null timeRemaining for audible tabs", async () => {
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
        },
        tabs: [makeTab({ id: 1, audible: true })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info).toEqual({ timeRemainingMs: null, isExcluded: false });
    });

    it("returns isExcluded=true for excluded URL patterns", async () => {
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.excludedPatterns]: ["example.com"],
        },
        tabs: [makeTab({ id: 1, url: "https://example.com/page" })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info).toEqual({ timeRemainingMs: null, isExcluded: true });
    });

    it("returns null when tab has no lastAccessed time", async () => {
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
        },
        tabs: [makeTab({ id: 1, lastAccessed: undefined })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info).toEqual({ timeRemainingMs: null, isExcluded: false });
    });

    it("calculates time remaining correctly", async () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * MS_PER_MINUTE;

      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
        },
        tabs: [makeTab({ id: 1, lastAccessed: fiveMinutesAgo })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info.timeRemainingMs).toEqual(25 * MS_PER_MINUTE);
      expect(info.isExcluded).toEqual(false);
    });

    it("returns 0 when timeout has elapsed", async () => {
      const now = Date.now();
      const fortyMinutesAgo = now - 40 * MS_PER_MINUTE;

      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
        },
        tabs: [makeTab({ id: 1, lastAccessed: fortyMinutesAgo })],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info.timeRemainingMs).toEqual(0);
    });

    it("uses smart timeout when enabled", async () => {
      const now = Date.now();
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: true,
          [storageKeys.accessHistory]: {
            "https://frequent.com": Array(10).fill(now - 1000),
          },
        },
        tabs: [
          makeTab({
            id: 1,
            url: "https://frequent.com",
            lastAccessed: now - 5 * MS_PER_MINUTE,
          }),
        ],
      });

      const info = await manager.getTabTimeoutInfo(1);
      expect(info.timeRemainingMs).toBeGreaterThan(25 * MS_PER_MINUTE);
    });

    it("falls back to lastAccessedMsById when tab.lastAccessed is missing", async () => {
      const tab = makeTab({ id: 1, lastAccessed: undefined });

      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
        },
        tabs: [tab],
      });

      await manager.updateLastAccessed(1);
      vi.advanceTimersByTime(10 * MS_PER_MINUTE);

      const info = await manager.getTabTimeoutInfo(1);
      expect(info.timeRemainingMs).toEqual(20 * MS_PER_MINUTE);
    });
  });

  describe("updateLastAccessed", () => {
    it("records current time and url for tab", async () => {
      const tab = makeTab({
        id: 1,
        url: "https://example.com/page",
        lastAccessed: undefined,
      });
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
        },
        tabs: [tab],
      });

      const infoBefore = await manager.getTabTimeoutInfo(1);
      expect(infoBefore.timeRemainingMs).toEqual(null);

      await manager.updateLastAccessed(1);

      const infoAfter = await manager.getTabTimeoutInfo(1);
      expect(infoAfter.timeRemainingMs).toEqual(30 * MS_PER_MINUTE);
    });
  });

  describe("locked tabs", () => {
    it("getLockedTabs returns empty initially", async () => {
      const { manager } = await createTabManager();
      expect(manager.getLockedTabs()).toEqual([]);
    });

    it("updateLocked adds and removes locked tabs", async () => {
      const tab = makeTab({ id: 1, url: "https://example.com" });
      const { manager } = await createTabManager({ tabs: [tab] });

      await manager.updateLocked(1, true);
      expect(manager.getLockedTabs()).toEqual([1]);

      await manager.updateLocked(1, false);
      expect(manager.getLockedTabs()).toEqual([]);
    });

    it("persistLockedTabs stores normalized URLs", async () => {
      const tab = makeTab({
        id: 1,
        url: "https://example.com/page?foo=bar",
      });
      const { manager, storage } = await createTabManager({ tabs: [tab] });

      await manager.updateLocked(1, true);

      const lockedUrls = storage[storageKeys.lockedTabUrls] as string[];
      expect(lockedUrls).toEqual(["https://example.com/page"]);
    });

    it("restoreLockedTabs matches tabs by normalized URL", async () => {
      const tab1 = makeTab({
        id: 1,
        url: "https://example.com/page?session=abc",
      });
      const tab2 = makeTab({
        id: 2,
        url: "https://other.com/",
      });
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.lockedTabUrls]: ["https://example.com/page"],
        },
        tabs: [tab1, tab2],
      });

      await manager.restoreLockedTabs();

      expect(manager.getLockedTabs()).toContain(1);
      expect(manager.getLockedTabs()).not.toContain(2);
    });

    it("restoreLockedTabs handles duplicate locked URLs correctly", async () => {
      const tab1 = makeTab({ id: 1, url: "https://example.com/" });
      const tab2 = makeTab({ id: 2, url: "https://example.com/" });
      const tab3 = makeTab({ id: 3, url: "https://example.com/" });

      const { manager } = await createTabManager({
        storage: {
          [storageKeys.lockedTabUrls]: [
            "https://example.com/",
            "https://example.com/",
          ],
        },
        tabs: [tab1, tab2, tab3],
      });

      await manager.restoreLockedTabs();

      expect(manager.getLockedTabs()).toHaveLength(2);
    });
  });

  describe("handleRemovedTab", () => {
    it("cleans up internal state for removed tab", async () => {
      const tab = makeTab({
        id: 1,
        url: "https://example.com/page",
        lastAccessed: undefined,
      });
      const { manager } = await createTabManager({
        storage: {
          [storageKeys.autoClose]: true,
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
        },
        tabs: [tab],
      });

      await manager.updateLastAccessed(1);
      const infoBefore = await manager.getTabTimeoutInfo(1);
      expect(infoBefore.timeRemainingMs).toEqual(30 * MS_PER_MINUTE);

      await manager.handleRemovedTab(1, false);

      const infoAfter = await manager.getTabTimeoutInfo(1);
      expect(infoAfter.timeRemainingMs).toEqual(null);
    });

    it("clears access history on manual close", async () => {
      const tab = makeTab({ id: 1, url: "https://example.com/page" });
      const { manager, storage } = await createTabManager({ tabs: [tab] });

      await manager.updateLastAccessed(1);
      manager.recordAccess("https://example.com/page");

      await manager.handleRemovedTab(1, false);

      const persisted = storage[storageKeys.accessHistory] as Record<
        string,
        number[]
      >;
      expect(persisted["https://example.com/page"]).toEqual(undefined);
    });

    it("preserves access history on window closing", async () => {
      const tab = makeTab({ id: 1, url: "https://example.com/page" });
      const { manager, storage } = await createTabManager({ tabs: [tab] });

      await manager.updateLastAccessed(1);
      manager.recordAccess("https://example.com/page");

      await manager.handleRemovedTab(1, true);

      const persisted = storage[storageKeys.accessHistory] as Record<
        string,
        number[]
      >;
      expect(persisted["https://example.com/page"]).toHaveLength(1);
    });

    it("persists locked tabs when a locked tab is removed", async () => {
      const tab = makeTab({ id: 1, url: "https://example.com" });
      const { manager, storageSets } = await createTabManager({ tabs: [tab] });

      await manager.updateLocked(1, true);
      const setCountBeforeRemove = storageSets.length;

      await manager.handleRemovedTab(1, false);

      const lockedTabSets = storageSets
        .slice(setCountBeforeRemove)
        .filter((s) => storageKeys.lockedTabUrls in s);
      expect(lockedTabSets.length).toBeGreaterThan(0);
      expect(manager.getLockedTabs()).toEqual([]);
    });
  });

  describe("cleanupInactiveTabs", () => {
    it("removes tabs that have exceeded their timeout", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        lastAccessed: now - 40 * MS_PER_MINUTE,
        url: "https://example.com",
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([1]);
    });

    it("does not remove tabs within timeout", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        lastAccessed: now - 10 * MS_PER_MINUTE,
        url: "https://example.com",
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("skips pinned tabs", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        pinned: true,
        lastAccessed: now - 40 * MS_PER_MINUTE,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("skips active tabs", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        active: true,
        lastAccessed: now - 40 * MS_PER_MINUTE,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("skips audible tabs", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        audible: true,
        lastAccessed: now - 40 * MS_PER_MINUTE,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("skips locked tabs", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        url: "https://example.com",
        lastAccessed: now - 40 * MS_PER_MINUTE,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.updateLocked(1, true);
      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("skips excluded URL patterns", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        url: "https://mail.google.com/inbox",
        lastAccessed: now - 40 * MS_PER_MINUTE,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: ["mail.google.com"],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("updates lastAccessed for tabs with no access time", async () => {
      const tab = makeTab({
        id: 1,
        url: "https://example.com",
        lastAccessed: undefined,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("uses smart timeout when enabled", async () => {
      const now = Date.now();
      const tab = makeTab({
        id: 1,
        url: "https://frequent.com",
        lastAccessed: now - 35 * MS_PER_MINUTE,
      });

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: true,
          [storageKeys.excludedPatterns]: [],
          [storageKeys.accessHistory]: {
            "https://frequent.com": Array(10).fill(now - 1000),
          },
        },
        tabs: [tab],
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([]);
    });

    it("removes multiple expired tabs in one cleanup", async () => {
      const now = Date.now();
      const tabs = [
        makeTab({
          id: 1,
          url: "https://a.com",
          lastAccessed: now - 40 * MS_PER_MINUTE,
        }),
        makeTab({
          id: 2,
          url: "https://b.com",
          lastAccessed: now - 50 * MS_PER_MINUTE,
        }),
        makeTab({
          id: 3,
          url: "https://c.com",
          lastAccessed: now - 5 * MS_PER_MINUTE,
        }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: {
          [storageKeys.timeoutMinutes]: 30,
          [storageKeys.smartTimeout]: false,
          [storageKeys.excludedPatterns]: [],
        },
        tabs,
      });

      await manager.cleanupInactiveTabs();

      expect(removedTabIds).toEqual([1, 2]);
    });
  });

  describe("closeAllTabs", () => {
    it("closes eligible tabs", async () => {
      const tabs = [
        makeTab({ id: 1, url: "https://a.com" }),
        makeTab({ id: 2, url: "https://b.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: [] },
        tabs,
      });

      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([1, 2]);
    });

    it("skips active tab", async () => {
      const tabs = [
        makeTab({ id: 1, active: true, url: "https://a.com" }),
        makeTab({ id: 2, url: "https://b.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: [] },
        tabs,
      });

      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([2]);
    });

    it("skips pinned tabs", async () => {
      const tabs = [
        makeTab({ id: 1, pinned: true, url: "https://a.com" }),
        makeTab({ id: 2, url: "https://b.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: [] },
        tabs,
      });

      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([2]);
    });

    it("skips audible tabs", async () => {
      const tabs = [
        makeTab({ id: 1, audible: true, url: "https://a.com" }),
        makeTab({ id: 2, url: "https://b.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: [] },
        tabs,
      });

      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([2]);
    });

    it("skips locked tabs", async () => {
      const tabs = [
        makeTab({ id: 1, url: "https://a.com" }),
        makeTab({ id: 2, url: "https://b.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: [] },
        tabs,
      });

      await manager.updateLocked(1, true);
      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([2]);
    });

    it("skips tabs matching excluded patterns", async () => {
      const tabs = [
        makeTab({ id: 1, url: "https://mail.google.com/inbox" }),
        makeTab({ id: 2, url: "https://reddit.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: ["mail.google.com"] },
        tabs,
      });

      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([2]);
    });

    it("skips tabs with undefined id", async () => {
      const tabs = [
        makeTab({ id: undefined, url: "https://a.com" }),
        makeTab({ id: 2, url: "https://b.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: [] },
        tabs,
      });

      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([2]);
    });

    it("respects all exclusion rules simultaneously", async () => {
      const tabs = [
        makeTab({ id: 1, active: true, url: "https://active.com" }),
        makeTab({ id: 2, pinned: true, url: "https://pinned.com" }),
        makeTab({ id: 3, audible: true, url: "https://audible.com" }),
        makeTab({ id: 4, url: "https://mail.google.com" }),
        makeTab({ id: 5, url: "https://locked.com" }),
        makeTab({ id: 6, url: "https://closeable.com" }),
      ];

      const { manager, removedTabIds } = await createTabManager({
        storage: { [storageKeys.excludedPatterns]: ["mail.google.com"] },
        tabs,
      });

      await manager.updateLocked(5, true);
      await manager.closeAllTabs();

      expect(removedTabIds).toEqual([6]);
    });
  });
});
