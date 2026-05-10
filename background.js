// Injects all YouTube content scripts and styles into the given tab.
function injectYouTube(tabId) {
  console.log("[SlopFilter] injecting YouTube scripts into tab", tabId);
  chrome.scripting.insertCSS({ target: { tabId }, files: ["youtube-shorts.css"] })
    .catch(e => console.error("[SlopFilter] CSS error:", e));
  chrome.scripting.executeScript({ target: { tabId }, files: ["youtube-shorts.js"] })
    .catch(e => console.error("[SlopFilter] youtube-shorts error:", e));
  chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })
    .catch(e => console.error("[SlopFilter] content error:", e));
  chrome.scripting.executeScript({ target: { tabId }, files: ["youtube-shorts-labeler.js"] })
    .catch(e => console.error("[SlopFilter] labeler error:", e));
}

// Injects the Instagram Reels blocking script into the given tab.
function injectInstagram(tabId) {
  console.log("[SlopFilter] injecting Instagram script into tab", tabId);
  chrome.scripting.executeScript({ target: { tabId }, files: ["instagram-reels.js"] })
    .catch(e => console.error("[SlopFilter] Instagram error:", e));
}

// Injects the TikTok blocking script into the given tab.
function injectTikTok(tabId) {
  console.log("[SlopFilter] injecting TikTok script into tab", tabId);
  chrome.scripting.executeScript({ target: { tabId }, files: ["tiktok-reels.js"] })
    .catch(e => console.error("[SlopFilter] TikTok error:", e));
}

// Routes a tab to the correct inject function based on its URL.
function injectForTab(tab) {
  if (!tab.url) return;
  if (tab.url.includes("youtube.com")) injectYouTube(tab.id);
  else if (tab.url.includes("instagram.com")) injectInstagram(tab.id);
  else if (tab.url.includes("tiktok.com")) injectTikTok(tab.id);
}

// ── Label mode dataset handling ───────────────────────────────────────────────

// Receives LABEL_SHORT messages from the labeler content script,
// persists metadata to local storage, and downloads the thumbnail image.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "LABEL_SHORT") return false;
  const { videoId, title, thumbnailUrl, label } = msg.payload;
  if (!videoId) return false;

  // Append entry to the dataset, skipping duplicates for the same video+label.
  chrome.storage.local.get("slopfilter_dataset", (result) => {
    const dataset = result["slopfilter_dataset"] || [];
    const exists = dataset.some((e) => e.videoId === videoId && e.label === label);
    if (!exists) {
      dataset.push({ videoId, title, label, thumbnailUrl, timestamp: Date.now() });
      chrome.storage.local.set({ slopfilter_dataset: dataset });
    }
  });

  // Download the thumbnail to shorts-dataset/<label>/<videoId>.jpg.
  if (thumbnailUrl && thumbnailUrl.startsWith("http")) {
    chrome.downloads.download({
      url: thumbnailUrl,
      filename: `shorts-dataset/${label}/${videoId}.jpg`,
      conflictAction: "overwrite",
      saveAs: false,
    });
  }

  sendResponse({ ok: true });
  return true;
});

// Inject into any supported tabs that are already open when the service worker starts.
chrome.tabs.query({ url: ["*://www.youtube.com/*", "*://www.instagram.com/*", "*://www.tiktok.com/*"] }, (tabs) => {
  console.log("[SlopFilter] found existing tabs:", tabs.length);
  tabs.forEach(tab => injectForTab(tab));
});

// Inject whenever a supported tab finishes loading.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") injectForTab(tab);
});

// Re-inject when the user switches to a supported tab (handles already-loaded tabs).
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => injectForTab(tab));
});
