// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Enable/disable side panel based on whether the tab is a supported AI chat
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url) return;

  const isSupported =
    tab.url.includes('chatgpt.com') ||
    tab.url.includes('chat.openai.com') ||
    tab.url.includes('gemini.google.com');

  chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel/index.html',
    enabled: isSupported
  });
});
