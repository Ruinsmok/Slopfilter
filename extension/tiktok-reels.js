(() => {
  if (window.__slopTiktokLoaded) return;
  window.__slopTiktokLoaded = true;

  const KEY = "slopfilter_hide_tiktok";
  const OVERLAY_ID = "slop-tiktok-block";
  const CONFIG = { enabled: true };

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
    overlay.textContent = "TikTok blocked by Slop Filterer";
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function apply() {
    if (CONFIG.enabled) showOverlay();
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

  if (document.body) {
    apply();
  } else {
    document.addEventListener("DOMContentLoaded", apply);
  }
})();
