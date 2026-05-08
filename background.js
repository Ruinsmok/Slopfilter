function injectYouTube(tabId) {
  console.log("[SlopFilter] injecting YouTube scripts into tab", tabId);
  chrome.scripting.insertCSS({ target: { tabId }, files: ["youtube-shorts.css"] })
    .catch(e => console.error("[SlopFilter] CSS error:", e));
  chrome.scripting.executeScript({ target: { tabId }, files: ["youtube-shorts.js"] })
    .catch(e => console.error("[SlopFilter] youtube-shorts error:", e));
  chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })
    .catch(e => console.error("[SlopFilter] content error:", e));
}

function injectInstagram(tabId) {
  console.log("[SlopFilter] injecting Instagram script into tab", tabId);
  chrome.scripting.executeScript({ target: { tabId }, files: ["instagram-reels.js"] })
    .catch(e => console.error("[SlopFilter] Instagram error:", e));
}

function injectTikTok(tabId) {
  console.log("[SlopFilter] injecting TikTok script into tab", tabId);
  chrome.scripting.executeScript({ target: { tabId }, files: ["tiktok-reels.js"] })
    .catch(e => console.error("[SlopFilter] TikTok error:", e));
}

function injectForTab(tab) {
  if (!tab.url) return;
  if (tab.url.includes("youtube.com")) injectYouTube(tab.id);
  else if (tab.url.includes("instagram.com")) injectInstagram(tab.id);
  else if (tab.url.includes("tiktok.com")) injectTikTok(tab.id);
}

// Inject into existing matching tabs when service worker starts
chrome.tabs.query({ url: ["*://www.youtube.com/*", "*://www.instagram.com/*", "*://www.tiktok.com/*"] }, (tabs) => {
  console.log("[SlopFilter] found existing tabs:", tabs.length);
  tabs.forEach(tab => injectForTab(tab));
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") injectForTab(tab);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => injectForTab(tab));
});
