// Background service worker: opens the side panel when the toolbar icon is clicked.
// Everything else (scanning, backend calls) happens in the side panel itself.

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
