export const storageKeys = {
  timeoutMinutes: "timeoutMinutes",
  lockedTabs: "lockedTabs",
};

export type CloseAllTabsMessage = {
  kind: "closeAllTabs";
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

export type Message =
  | CloseAllTabsMessage
  | GetLockedTabsMessage
  | LockTabMessage
  | UnlockTabMessage;

export function isKnownMessage(message: unknown): message is Message {
  return typeof message === "object" && message !== null && "kind" in message;
}
