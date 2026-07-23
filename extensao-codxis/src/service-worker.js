"use strict";

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.storage.local.set({
      "avante.install": {
        installedAt: new Date().toISOString(),
        version: chrome.runtime.getManifest().version
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AVANTE_VERSION") {
    sendResponse({ version: chrome.runtime.getManifest().version });
  }
});
