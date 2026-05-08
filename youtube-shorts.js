(() => {
  if (window.__slopShortsLoaded) return;
  window.__slopShortsLoaded = true;

  const CONFIG = { enabled: true };

  chrome.storage.sync.get("slopfilter_hide_shorts", (result) => {
    CONFIG.enabled = result["slopfilter_hide_shorts"] ?? true;
    if (CONFIG.enabled) applyAll(); else showAll();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if ("slopfilter_hide_shorts" in changes) {
      CONFIG.enabled = changes["slopfilter_hide_shorts"].newValue ?? true;
      if (CONFIG.enabled) applyAll(); else showAll();
    }
  });

  const TARGETS = [
    // Shorts shelf — old Polymer elements
    {
      inner: "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]",
      outer: "ytd-rich-section-renderer, ytd-rich-item-renderer",
    },
    // Shorts shelf — new view model element
    {
      inner: "grid-shelf-view-model",
      outer: "ytd-rich-section-renderer",
    },
    // Individual shorts cards mixed into the video grid (old DOM)
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

  function hide(el) {
    el.dataset.slopShortsHidden = "1";
    el.style.setProperty("display", "none", "important");
  }

  function showAll() {
    document.querySelectorAll("[data-slop-shorts-hidden]").forEach((el) => {
      delete el.dataset.slopShortsHidden;
      el.style.removeProperty("display");
    });
  }

  function applyAll() {
    if (!CONFIG.enabled) return;
    for (const { inner, outer } of TARGETS) {
      document.querySelectorAll(inner).forEach((el) => {
        const container = el.closest(outer) || el;
        hide(container);
      });
    }
  }

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

  document.addEventListener("yt-navigate-finish", applyAll);
})();
