export const storageKeys = {
  timeoutMinutes: "timeoutMinutes",
  lockedTabs: "lockedTabs",
  autoClose: "autoClose",
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

export type Message =
  | CloseAllTabsMessage
  | CleanupInactiveTabsMessage
  | GetLockedTabsMessage
  | LockTabMessage
  | UnlockTabMessage
  | AutoCloseMessage;

export function isKnownMessage(message: unknown): message is Message {
  return typeof message === "object" && message !== null && "kind" in message;
}
