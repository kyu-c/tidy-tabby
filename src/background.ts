import { GetLockedTabsResponse, isKnownMessage } from "./lib/chrome";
import { TabManager } from "./lib/tabManager";

const TAB_CLEANUP_ALARM_NAME = "tabCleanupAlarm";
const tabManager = new TabManager();

chrome.alarms.create(TAB_CLEANUP_ALARM_NAME, {
  periodInMinutes: 1,
});

chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm.name === TAB_CLEANUP_ALARM_NAME) {
    console.debug("Tab cleanup alarm triggered");
    tabManager.cleanupInactiveTabs();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const { tabId } = activeInfo;
  console.debug("Tab activated:", tabId);
  tabManager.updateLastAccessed(tabId);
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
});
