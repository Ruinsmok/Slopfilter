(() => {
  if (window.__slopIgReelsLoaded) return;
  window.__slopIgReelsLoaded = true;

  const KEY = "slopfilter_hide_ig_reels";
  const OVERLAY_ID = "slop-ig-reels-block";
  const CONFIG = { enabled: true };

  // Selectors for Reels nav entry and feed shelves
  const NAV_SELECTORS = [
    'a[href="/reels/"]',
    'a[aria-label="Reels"]',
  ];

  function hideReelsNav() {
    for (const sel of NAV_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        const container = el.closest('li, [role="listitem"], [role="menuitem"]') || el;
        container.style.setProperty("display", "none", "important");
        container.dataset.slopReelsHidden = "1";
      });
    }
  }

  function showReelsNav() {
    document.querySelectorAll("[data-slop-reels-hidden]").forEach((el) => {
      el.style.removeProperty("display");
      delete el.dataset.slopReelsHidden;
    });
  }

  function isOnReelsPage() {
    return location.pathname === "/reels/" || location.pathname === "/reels";
  }

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:#000",
      "color:#fff",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:12px",
      "font-size:1.4rem",
      "font-family:system-ui,sans-serif",
      "z-index:99999",
    ].join(";");
    overlay.textContent = "Instagram Reels blocked by Slop Filterer";
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function apply() {
    if (!CONFIG.enabled) {
      removeOverlay();
      showReelsNav();
      return;
    }
    hideReelsNav();
    if (isOnReelsPage()) showOverlay();
    else removeOverlay();
  }

  chrome.storage.sync.get(KEY, (result) => {
    CONFIG.enabled = result[KEY] ?? true;
    apply();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (KEY in changes) {
      CONFIG.enabled = changes[KEY].newValue ?? true;
      apply();
    }
  });

  // Re-run on Instagram's SPA navigations
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    apply();
  };
  window.addEventListener("popstate", apply);

  // DOM observer to catch lazy-rendered nav elements
  const observer = new MutationObserver(() => {
    if (CONFIG.enabled) apply();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  apply();
})();
