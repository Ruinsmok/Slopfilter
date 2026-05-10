(() => {
  if (window.__slopFilterLoaded) return;
  window.__slopFilterLoaded = true;

  console.log("[SlopFilter] content script loaded");

  const KEYS = {
    duration: "slopfilter_min_duration_seconds",
    durationEnabled: "slopfilter_duration_enabled",
    slopEnabled: "slopfilter_slop_enabled",
  };
  const DEFAULT_MIN_SECONDS = 3 * 60;

  const CONFIG = {
    minDurationSeconds: DEFAULT_MIN_SECONDS,
    durationEnabled: true,
    slopEnabled: true,
  };

  // Load saved settings and run an initial scan.
  chrome.storage.sync.get(Object.values(KEYS), (result) => {
    CONFIG.minDurationSeconds = result[KEYS.duration] ?? DEFAULT_MIN_SECONDS;
    CONFIG.durationEnabled = result[KEYS.durationEnabled] ?? true;
    CONFIG.slopEnabled = result[KEYS.slopEnabled] ?? true;
    rescan();
  });

  // Re-evaluate all cards whenever the user changes a setting.
  chrome.storage.onChanged.addListener((changes) => {
    if (KEYS.duration in changes) CONFIG.minDurationSeconds = changes[KEYS.duration].newValue ?? DEFAULT_MIN_SECONDS;
    if (KEYS.durationEnabled in changes) CONFIG.durationEnabled = changes[KEYS.durationEnabled].newValue ?? true;
    if (KEYS.slopEnabled in changes) CONFIG.slopEnabled = changes[KEYS.slopEnabled].newValue ?? true;
    rescan();
  });

  const SLOP_SIGNALS = {
    titlePatterns: [
      /you won'?t believe/i,
      /i asked (ai|chatgpt|claude|gpt|gemini)/i,
      /this (changed|ruined|broke|destroyed) everything/i,
      /\bpov\b.{0,10}:/i,
      /\b(shocking|mind.?blow|insane|crazy|unbelievable)\b/i,
      /day \d+ of\b/i,
      /\bwait for it\b/i,
      /watch till the end/i,
      /\bcash app\b/i,
      /\bgive ?away\b/i,
      /\b(sigma|alpha|grind ?set)\b/i,
    ],
    signalModel: null,
  };

  // Cache hide/show decisions by videoId to avoid re-evaluating unchanged cards.
  const decisionCache = new Map();

  // Extracts a stable video identifier (v= param or /shorts/ path) from a card.
  function getVideoId(item) {
    const a = item.querySelector(
      "a#thumbnail[href], a.ytd-thumbnail[href], " +
      "a.ytLockupMetadataViewModelTitle[href], a[href*='/watch?v='], a[href*='/shorts/']"
    );
    if (!a) return null;
    try {
      const url = new URL(a.href, location.origin);
      return url.searchParams.get("v") || url.pathname;
    } catch {
      return null;
    }
  }

  // Converts a "MM:SS" or "HH:MM:SS" duration string into total seconds.
  function parseDuration(text) {
    const parts = text.trim().split(":").map(Number);
    if (parts.some(isNaN) || parts.length < 2) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  // Returns true if the card contains a YouTube ad renderer element.
  function isAd(item) {
    return (
      item.hasAttribute("is-ad") ||
      !!item.querySelector(
        "ytd-display-ad-renderer, ytd-ad-slot-renderer, " +
        "ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer"
      )
    );
  }

  // Returns true if the video's duration badge is below the configured minimum.
  function isTooShort(item) {
    if (!CONFIG.durationEnabled) return false;
    const badge = item.querySelector(
      "ytd-thumbnail-overlay-time-status-renderer yt-formatted-string, " +
      "ytd-thumbnail-overlay-time-status-renderer span, " +
      "div.ytBadgeShapeText"
    );
    if (!badge) return false;
    const text = badge.textContent.trim();
    if (/^(LIVE|SHORTS)$/i.test(text)) return false;
    const seconds = parseDuration(text);
    return seconds !== null && seconds < CONFIG.minDurationSeconds;
  }

  // Returns true if the video title matches any known clickbait pattern.
  function isSlopContent(item) {
    if (!CONFIG.slopEnabled) return false;
    const titleEl = item.querySelector(
      "#video-title, #video-title-link, yt-formatted-string#video-title, " +
      "a.ytLockupMetadataViewModelTitle span, a.ytLockupMetadataViewModelTitle"
    );
    const title = (titleEl?.getAttribute("title") || titleEl?.textContent || "").trim();
    if (!title) return false;
    if (SLOP_SIGNALS.titlePatterns.some((p) => p.test(title))) return true;
    if (SLOP_SIGNALS.signalModel?.(item)) return true;
    return false;
  }

  // Returns true if the card should be hidden (ad, too short, or slop title).
  function shouldHide(item) {
    return isAd(item) || isTooShort(item) || isSlopContent(item);
  }

  // Evaluates a single card, using cached decisions when possible.
  function evaluateItem(item) {
    const videoId = getVideoId(item);
    const cached = item.dataset.slopVideoId;
    if (cached && cached === videoId && item.dataset.slopDecided) {
      applyDecision(item, item.dataset.slopDecided === "hide");
      return;
    }
    if (!videoId) {
      waitForContent(item);
      return;
    }
    if (decisionCache.has(videoId)) {
      const hide = decisionCache.get(videoId) === "hide";
      stamp(item, videoId, hide);
      applyDecision(item, hide);
      return;
    }
    const hide = shouldHide(item);
    decisionCache.set(videoId, hide ? "hide" : "show");
    stamp(item, videoId, hide);
    applyDecision(item, hide);
  }

  // Writes the decision result onto the element as data attributes.
  function stamp(item, videoId, hide) {
    item.dataset.slopVideoId = videoId;
    item.dataset.slopDecided = hide ? "hide" : "show";
  }

  // Shows or hides a card element based on the hide flag.
  function applyDecision(item, hide) {
    if (hide) {
      item.style.setProperty("display", "none", "important");
    } else {
      item.style.removeProperty("display");
    }
  }

  // Watches a card with a MutationObserver until its video link resolves, then evaluates it.
  function waitForContent(item) {
    if (item.dataset.slopWaiting) return;
    item.dataset.slopWaiting = "1";
    const mo = new MutationObserver(() => {
      if (getVideoId(item)) {
        mo.disconnect();
        delete item.dataset.slopWaiting;
        evaluateItem(item);
      }
    });
    mo.observe(item, { childList: true, subtree: true, attributes: true });
  }

  // Evaluates all video cards currently present in the DOM.
  function scanAll() {
    document.querySelectorAll("ytd-rich-item-renderer").forEach(evaluateItem);
  }

  // Clears the decision cache and re-evaluates every card (called after settings change).
  function rescan() {
    decisionCache.clear();
    document.querySelectorAll("ytd-rich-item-renderer").forEach((el) => {
      delete el.dataset.slopVideoId;
      delete el.dataset.slopDecided;
      evaluateItem(el);
    });
  }

  // Watches for new cards added by infinite scroll and evaluates them immediately.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.tagName === "YTD-RICH-ITEM-RENDERER") {
          evaluateItem(node);
        } else {
          node.querySelectorAll("ytd-rich-item-renderer").forEach(evaluateItem);
        }
      }
      if (
        m.type === "attributes" &&
        m.target instanceof Element &&
        m.target.tagName === "YTD-RICH-ITEM-RENDERER"
      ) {
        delete m.target.dataset.slopDecided;
        evaluateItem(m.target);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["is-ad"],
  });

  scanAll();

  // Re-scan after YouTube's client-side navigation and page data updates.
  document.addEventListener("yt-navigate-finish", rescan);
  document.addEventListener("yt-page-data-updated", rescan);

  // Delayed scans to catch cards that render after the initial DOM settle.
  setTimeout(scanAll, 1500);
  setTimeout(scanAll, 4000);
})();
