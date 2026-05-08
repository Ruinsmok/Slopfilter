/**
 * SlopFilter content script — YouTube video grid (ytd-rich-item-renderer)
 *
 * Hides items that satisfy any of:
 *   1. Is an ad (structural check; CSS handles most, JS catches dynamic ones)
 *   2. Video duration < CONFIG.minDurationSeconds
 *   3. Video matches any SLOP_SIGNALS pattern (extensible)
 */

const STORAGE_KEY = "slopfilter_min_duration_seconds";
const DEFAULT_MIN_SECONDS = 3 * 60;

const CONFIG = {
  minDurationSeconds: DEFAULT_MIN_SECONDS,
};

// Keep CONFIG in sync with storage
chrome.storage.sync.get(STORAGE_KEY, (result) => {
  CONFIG.minDurationSeconds = result[STORAGE_KEY] ?? DEFAULT_MIN_SECONDS;
  rescan();
});

chrome.storage.onChanged.addListener((changes) => {
  if (STORAGE_KEY in changes) {
    CONFIG.minDurationSeconds = changes[STORAGE_KEY].newValue ?? DEFAULT_MIN_SECONDS;
    rescan();
  }
});

// ---------------------------------------------------------------------------
// Slop signal definitions — add patterns here, or replace with a model hook
// ---------------------------------------------------------------------------
const SLOP_SIGNALS = {
  // Title substring/regex patterns that indicate low-quality content
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

  /**
   * signalModel(item) — plug in a real model here later.
   * Receives the raw ytd-rich-item-renderer DOM element.
   * Return true to hide, false to keep.
   */
  signalModel: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "H:MM:SS" or "M:SS" duration text into total seconds. */
function parseDuration(text) {
  const parts = text.trim().split(":").map(Number);
  if (parts.some(isNaN) || parts.length < 2) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** True if the item is an ad (catches dynamically injected ones CSS may miss). */
function isAd(item) {
  return (
    item.hasAttribute("is-ad") ||
    item.querySelector(
      "ytd-display-ad-renderer, ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer"
    ) !== null
  );
}

/** True if the video is shorter than the configured minimum. */
function isTooShort(item) {
  const durationEl = item.querySelector(
    // YouTube uses multiple selector paths depending on page variant
    "ytd-thumbnail-overlay-time-status-renderer yt-formatted-string, " +
    "ytd-thumbnail-overlay-time-status-renderer span"
  );
  if (!durationEl) return false; // no badge = livestream/premiere, keep it
  const text = durationEl.textContent;
  if (/LIVE|SHORTS/i.test(text)) return false; // shorts handled by CSS
  const seconds = parseDuration(text);
  if (seconds === null) return false;
  return seconds < CONFIG.minDurationSeconds;
}

/** True if the item matches any slop signal. */
function isSlopContent(item) {
  const titleEl = item.querySelector(
    "#video-title, #video-title-link, yt-formatted-string#video-title"
  );
  const title =
    (titleEl && (titleEl.getAttribute("title") || titleEl.textContent)) || "";

  if (SLOP_SIGNALS.titlePatterns.some((p) => p.test(title))) return true;
  if (SLOP_SIGNALS.signalModel && SLOP_SIGNALS.signalModel(item)) return true;
  return false;
}

/** Apply filtering to a single item. Marks it so it is not re-evaluated. */
function evaluateItem(item) {
  if (item.dataset.slopChecked) return;
  item.dataset.slopChecked = "1";

  if (isAd(item) || isTooShort(item) || isSlopContent(item)) {
    item.dataset.slopHidden = "1"; // CSS rule picks this up
  }
}

/** Scan all currently present items. */
function scanAll() {
  document.querySelectorAll("ytd-rich-item-renderer").forEach(evaluateItem);
}

/** Clear all marks and re-evaluate every item (used when config changes). */
function rescan() {
  document.querySelectorAll("ytd-rich-item-renderer").forEach((el) => {
    delete el.dataset.slopChecked;
    delete el.dataset.slopHidden;
    el.removeAttribute("data-slop-hidden");
  });
  scanAll();
}

// ---------------------------------------------------------------------------
// Observe DOM for dynamically added items (infinite scroll, SPA navigation)
// ---------------------------------------------------------------------------
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.tagName === "YTD-RICH-ITEM-RENDERER") {
        evaluateItem(node);
      } else {
        node
          .querySelectorAll("ytd-rich-item-renderer")
          .forEach(evaluateItem);
      }
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

// Initial pass once the idle callback fires (DOM is ready at document_idle)
scanAll();

// Re-scan on YouTube SPA navigations (yt-navigate-finish fires on every page change)
document.addEventListener("yt-navigate-finish", () => {
  // Clear marks so items on the new page are evaluated fresh
  document
    .querySelectorAll("ytd-rich-item-renderer[data-slop-checked]")
    .forEach((el) => {
      delete el.dataset.slopChecked;
      delete el.dataset.slopHidden;
    });
  scanAll();
});
