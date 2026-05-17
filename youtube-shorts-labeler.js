(() => {
  if (window.__slopLabelerLoaded) return;
  window.__slopLabelerLoaded = true;

  const CONFIG = { enabled: false };

  // Walks up from every watch-link to its ytd-rich-item-renderer card.
  // Uses only a.ytLockupMetadataViewModelTitle — YouTube's new DOM puts the
  // href there, not on a#thumbnail.
  function getAllVideoCards() {
    const cards = new Set();
    document.querySelectorAll("a.ytLockupMetadataViewModelTitle").forEach((a) => {
      const card = a.closest("ytd-rich-item-renderer");
      if (card) cards.add(card);
    });
    return cards;
  }

  // Extracts videoId, title, and thumbnail URL from a normal video card element.
  function getCardData(card) {
    const imgEl = card.querySelector("yt-thumbnail-view-model img, img#img, img.yt-core-image");
    const titleEl = card.querySelector(
      ".ytLockupMetadataViewModelTitleText, a.ytLockupMetadataViewModelTitle, h3 span"
    );
    const linkEl = card.querySelector("a.ytLockupMetadataViewModelTitle");

    const href = linkEl?.getAttribute("href") || "";
    let videoId = "";
    try {
      videoId = new URL(href, location.origin).searchParams.get("v") || "";
    } catch {}
    const title = titleEl?.textContent?.trim() || "";
    const thumbnailUrl = imgEl?.src || "";

    return { videoId, title, thumbnailUrl };
  }

  // Returns the thumbnail wrapper within a card, used as the overlay mount point.
  // New lockup DOM uses yt-thumbnail-view-model instead of ytd-thumbnail.
  function getThumbnailEl(card) {
    return card.querySelector("yt-thumbnail-view-model, ytd-thumbnail");
  }

  // Removes the label overlay from a card and cleans up its inline positioning.
  function removeOverlay(card) {
    card.querySelector(".slop-label-overlay")?.remove();
    getThumbnailEl(card)?.style.removeProperty("position");
  }

  // Builds and appends the Keep / Slop overlay UI onto a video card's thumbnail.
  function attachOverlay(card) {
    if (card.querySelector(".slop-label-overlay")) return;

    const thumbEl = getThumbnailEl(card);
    if (!thumbEl) return;
    thumbEl.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.className = "slop-label-overlay";
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 8px;
      padding: 8px;
      background: linear-gradient(transparent 40%, rgba(0,0,0,0.7) 100%);
      z-index: 9999;
      pointer-events: none;
    `;

    // Creates a styled label button that sends a LABEL_SHORT message on click.
    function makeBtn(label, color, labelValue) {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `
        pointer-events: all;
        cursor: pointer;
        padding: 5px 14px;
        border: none;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 700;
        color: #fff;
        background: ${color};
        opacity: 0.92;
        transition: transform 0.1s, opacity 0.1s;
      `;
      btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; btn.style.transform = "scale(1.07)"; });
      btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.92"; btn.style.transform = ""; });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = getCardData(card);
        if (!data.videoId) return;
        chrome.runtime.sendMessage({
          type: "LABEL_SHORT",
          payload: { ...data, label: labelValue },
        });
        // Replace buttons with a confirmation indicator after labeling.
        overlay.style.background = labelValue === "keep"
          ? "rgba(0,180,0,0.45)"
          : "rgba(220,0,0,0.45)";
        overlay.querySelectorAll("button").forEach((b) => (b.style.display = "none"));
        const tick = document.createElement("span");
        tick.textContent = labelValue === "keep" ? "✓ Saved" : "✗ Saved";
        tick.style.cssText = "color:#fff;font-weight:700;font-size:14px;padding-bottom:10px;";
        overlay.appendChild(tick);
      });
      return btn;
    }

    overlay.appendChild(makeBtn("✓ Keep", "#1a9e3f", "keep"));
    overlay.appendChild(makeBtn("✗ Slop", "#c0392b", "slop"));
    thumbEl.appendChild(overlay);
  }

  // Attaches or removes the overlay on a single card based on the current config.
  function applyToCard(card) {
    if (CONFIG.enabled) attachOverlay(card);
    else removeOverlay(card);
  }

  // Runs applyToCard on every normal video card currently in the DOM.
  function applyAll() {
    getAllVideoCards().forEach(applyToCard);
  }

  // Strips all label overlays from the page when label mode is turned off.
  function removeAll() {
    document.querySelectorAll(".slop-label-overlay").forEach((el) => {
      const card = el.parentElement;
      el.remove();
      card?.style.removeProperty("position");
    });
  }

  // Load initial label mode state from storage.
  chrome.storage.sync.get("slopfilter_label_mode", (result) => {
    CONFIG.enabled = result["slopfilter_label_mode"] ?? false;
    if (CONFIG.enabled) applyAll();
  });

  // React to label mode being toggled in the popup.
  chrome.storage.onChanged.addListener((changes) => {
    if ("slopfilter_label_mode" in changes) {
      CONFIG.enabled = changes["slopfilter_label_mode"].newValue ?? false;
      if (CONFIG.enabled) applyAll(); else removeAll();
    }
  });

  // Re-run applyAll whenever new nodes are added to the page (infinite scroll).
  const observer = new MutationObserver(() => {
    if (!CONFIG.enabled) return;
    applyAll();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Re-apply overlays after YouTube's client-side navigation completes.
  document.addEventListener("yt-navigate-finish", () => {
    if (CONFIG.enabled) applyAll();
  });
})();
