(() => {
  if (window.__slopShortsLoaded) return;
  window.__slopShortsLoaded = true;

  const CONFIG = { enabled: true };

  // Load the hide-shorts toggle state from storage and apply it immediately.
  chrome.storage.sync.get("slopfilter_hide_shorts", (result) => {
    CONFIG.enabled = result["slopfilter_hide_shorts"] ?? true;
    if (CONFIG.enabled) applyAll(); else showAll();
  });

  // React to the toggle being changed in the popup while the page is open.
  chrome.storage.onChanged.addListener((changes) => {
    if ("slopfilter_hide_shorts" in changes) {
      CONFIG.enabled = changes["slopfilter_hide_shorts"].newValue ?? true;
      if (CONFIG.enabled) applyAll(); else showAll();
    }
  });

  // Each entry pairs an inner selector (identifies a Shorts element) with an
  // outer selector (the wrapping container to hide).
  const TARGETS = [
    // Shorts shelf
    {
      inner: "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]",
      outer: "ytd-rich-section-renderer, ytd-rich-item-renderer",
    },
    // Shorts shelf — new view model
    {
      inner: "grid-shelf-view-model",
      outer: "ytd-rich-section-renderer",
    },
    // Individual shorts cards in the video grid (old DOM)
    {
      inner: "a#thumbnail[href*='/shorts/']",
      outer: "ytd-rich-item-renderer",
    },
    // Individual shorts cards (new DOM)
    {
      inner: "a.ytLockupMetadataViewModelTitle[href*='/shorts/']",
      outer: "ytd-rich-item-renderer",
    },
    // Shorts filter chip
    {
      inner: "yt-chip-cloud-chip-renderer[title='Shorts']",
      outer: "yt-chip-cloud-chip-renderer",
    },
    // Shorts entry in the left sidebar guide
    {
      inner: "a[href='/shorts']",
      outer: "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer",
    },
  ];

  // Marks an element as hidden and forces display:none.
  function hide(el) {
    el.dataset.slopShortsHidden = "1";
    el.style.setProperty("display", "none", "important");
  }

  // Restores all previously hidden elements when the toggle is turned off.
  function showAll() {
    document.querySelectorAll("[data-slop-shorts-hidden]").forEach((el) => {
      delete el.dataset.slopShortsHidden;
      el.style.removeProperty("display");
    });
  }

  // Scans the full DOM and hides every matching Shorts container.
  function applyAll() {
    if (!CONFIG.enabled) return;
    for (const { inner, outer } of TARGETS) {
      document.querySelectorAll(inner).forEach((el) => {
        const container = el.closest(outer) || el;
        hide(container);
      });
    }
  }

  // Watches for dynamically inserted Shorts elements and hides them on arrival.
  const styleObserver = new MutationObserver((mutations) => {
    if (!CONFIG.enabled) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        for (const { inner, outer } of TARGETS) {
          if (node.matches(inner)) {
            hide(node.closest(outer) || node);
          } else {
            node.querySelectorAll(inner).forEach((el) => {
              hide(el.closest(outer) || el);
            });
          }
        }
      }
      if (m.type === "attributes" && m.attributeName === "style") {
        const el = m.target;
        for (const { inner } of TARGETS) {
          if (el.matches?.(inner)) {
            const container = TARGETS.find((t) => t.inner.includes(el.tagName.toLowerCase()));
            hide(el.closest(container?.outer || "*") || el);
            break;
          }
        }
      }
    }
  });

  styleObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "is-shorts"],
  });

  applyAll();

  // Re-apply after YouTube's client-side navigation changes the page content.
  document.addEventListener("yt-navigate-finish", applyAll);
})();
