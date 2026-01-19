import {
  GetLockedTabsResponse,
  GetTabTimeoutInfoResponse,
  isKnownMessage,
  storageKeys,
} from "./lib/chrome";
import { TabManager } from "./lib/tabManager";

const TAB_CLEANUP_ALARM_NAME = "tabCleanupAlarm";
const tabManager = new TabManager();

function createAutoCloseAlarm() {
  chrome.alarms.clear(TAB_CLEANUP_ALARM_NAME);
  console.debug("Creating auto close alarm");
  chrome.alarms.create(TAB_CLEANUP_ALARM_NAME, {
    periodInMinutes: 1,
  });
}

function cancelAutoCloseAlarm() {
  console.debug("Cancelling auto close alarm");
  chrome.alarms.clear(TAB_CLEANUP_ALARM_NAME);
}

async function setupAutoCloseAlarm() {
  const result = await chrome.storage.local.get(storageKeys.autoClose);
  if (result[storageKeys.autoClose] === true) {
    createAutoCloseAlarm();
  } else {
    cancelAutoCloseAlarm();
  }
}

setupAutoCloseAlarm();

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === TAB_CLEANUP_ALARM_NAME) {
    console.debug("Tab cleanup alarm triggered");
    tabManager.cleanupInactiveTabs();
  }
});

chrome.storage.local.onChanged.addListener((changes) => {
  const autoClose: boolean | undefined =
    changes[storageKeys.autoClose]?.newValue;
  if (autoClose === undefined) {
    return;
  }
  if (autoClose) {
    createAutoCloseAlarm();
  } else {
    cancelAutoCloseAlarm();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const { tabId } = activeInfo;
  console.debug("Tab activated:", tabId);
  tabManager.updateLastAccessed(tabId);

  const tab = await chrome.tabs.get(tabId);
  tabManager.recordAccess(tab.url);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  console.debug("Tab created:", tab.id);
  if (tab.id === undefined) {
    return;
  }
  tabManager.updateLastAccessed(tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabManager.handleRemovedTab(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isKnownMessage(message)) {
    console.error("Unknown message:", message);
    return;
  }
  console.debug("Received message:", message);

  if (message.kind === "closeAllTabs") {
    tabManager.closeAllTabs();
    sendResponse();
  }
  if (message.kind === "cleanupInactiveTabs") {
    tabManager.cleanupInactiveTabs();
    sendResponse();
  }
  if (message.kind === "getLockedTabs") {
    sendResponse({
      lockedTabs: tabManager.getLockedTabs(),
    } satisfies GetLockedTabsResponse);
  }
  if (message.kind === "lockTab") {
    tabManager.updateLocked(message.tabId, true);
    sendResponse();
  }
  if (message.kind === "unlockTab") {
    tabManager.updateLocked(message.tabId, false);
    sendResponse();
  }
  if (message.kind === "autoClose") {
    if (message.autoClose) {
      createAutoCloseAlarm();
    } else {
      cancelAutoCloseAlarm();
    }
  }
  if (message.kind === "getTabTimeoutInfo") {
    tabManager.getTimeRemainingMs(message.tabId).then((timeRemainingMs) => {
      sendResponse({ timeRemainingMs } satisfies GetTabTimeoutInfoResponse);
    });
    return true;
  }
});
