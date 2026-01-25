export const storageKeys = {
  timeoutMinutes: "timeoutMinutes",
  lockedTabs: "lockedTabs",
  lockedTabUrls: "lockedTabUrls",
  autoClose: "autoClose",
  smartTimeout: "smartTimeout",
  accessHistory: "accessHistory",
  excludedPatterns: "excludedPatterns",
  wizardVersion: "wizardVersion",
};

export type CloseAllTabsMessage = {
  kind: "closeAllTabs";
};

export type CleanupInactiveTabsMessage = {
  kind: "cleanupInactiveTabs";
};

export type GetLockedTabsMessage = {
  kind: "getLockedTabs";
};

export type GetLockedTabsResponse = {
  lockedTabs: number[];
};

export type LockTabMessage = {
  kind: "lockTab";
  tabId: number;
};

export type UnlockTabMessage = {
  kind: "unlockTab";
  tabId: number;
};

export type AutoCloseMessage = {
  kind: "autoClose";
  autoClose: boolean;
};

export type GetTabTimeoutInfoMessage = {
  kind: "getTabTimeoutInfo";
  tabId: number;
};

export type GetTabTimeoutInfoResponse = {
  timeRemainingMs: number | null;
  isExcluded: boolean;
};

export type Message =
  | CloseAllTabsMessage
  | CleanupInactiveTabsMessage
  | GetLockedTabsMessage
  | LockTabMessage
  | UnlockTabMessage
  | AutoCloseMessage
  | GetTabTimeoutInfoMessage;

export function isKnownMessage(message: unknown): message is Message {
  return typeof message === "object" && message !== null && "kind" in message;
}
