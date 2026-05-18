// Switches the visible tab panel when a tab button is clicked.
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

const KEYS = {
  labelMode: "slopfilter_label_mode",
  duration: "slopfilter_min_duration_seconds",
  hideShorts: "slopfilter_hide_shorts",
  durationEnabled: "slopfilter_duration_enabled",
  slopEnabled: "slopfilter_slop_enabled",
  hideIgReels: "slopfilter_hide_ig_reels",
  hideIgExplore: "slopfilter_hide_ig_explore",
  hideTiktok: "slopfilter_hide_tiktok",
};

const DEFAULT_SECONDS = 3 * 60;

const hideShortsEl = document.getElementById("hide-shorts");
const durationEnabledEl = document.getElementById("duration-enabled");
const slopEnabledEl = document.getElementById("slop-enabled");
const minDurationEl = document.getElementById("min-duration");
const durationRowEl = document.getElementById("duration-row");
const hideIgReelsEl = document.getElementById("hide-ig-reels");
const hideIgExploreEl = document.getElementById("hide-ig-explore");
const hideTiktokEl = document.getElementById("hide-tiktok");
const labelModeEl = document.getElementById("label-mode");
const labelExportRowEl = document.getElementById("label-export-row");
const exportDatasetEl = document.getElementById("export-dataset");
const clearDatasetEl = document.getElementById("clear-dataset");
const labelCountEl = document.getElementById("label-count");
const statusEl = document.getElementById("status");

let saveTimer = null;

// Briefly shows "Saved" in the status bar after any setting change.
function showSaved() {
  statusEl.textContent = "Saved";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { statusEl.textContent = ""; }, 1500);
}

// Greys out the min-duration input row when duration filtering is disabled.
function setDurationRowState(enabled) {
  durationRowEl.classList.toggle("disabled", !enabled);
}

// Load all settings from storage and populate the UI on popup open.
chrome.storage.sync.get(Object.values(KEYS), (result) => {
  hideShortsEl.checked = result[KEYS.hideShorts] ?? true;
  durationEnabledEl.checked = result[KEYS.durationEnabled] ?? true;
  slopEnabledEl.checked = result[KEYS.slopEnabled] ?? true;
  minDurationEl.value = Math.round((result[KEYS.duration] ?? DEFAULT_SECONDS) / 60);
  hideIgReelsEl.checked = result[KEYS.hideIgReels] ?? true;
  hideIgExploreEl.checked = result[KEYS.hideIgExplore] ?? true;
  hideTiktokEl.checked = result[KEYS.hideTiktok] ?? true;
  labelModeEl.checked = result[KEYS.labelMode] ?? false;
  setDurationRowState(durationEnabledEl.checked);
  setLabelExportState(labelModeEl.checked);
});

// Shows or hides the export/clear row and refreshes the label count.
function setLabelExportState(enabled) {
  labelExportRowEl.style.display = enabled ? "block" : "none";
  if (enabled) refreshLabelCount();
}

// Reads the stored dataset and updates the "N labeled (X keep, Y slop)" counter.
function refreshLabelCount() {
  chrome.storage.local.get("slopfilter_dataset", (r) => {
    const ds = r["slopfilter_dataset"] || [];
    const keep = ds.filter((e) => e.label === "keep").length;
    const slop = ds.filter((e) => e.label === "slop").length;
    labelCountEl.textContent = `${ds.length} labeled (${keep} keep, ${slop} slop)`;
  });
}

hideShortsEl.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEYS.hideShorts]: hideShortsEl.checked }, showSaved);
});

durationEnabledEl.addEventListener("change", () => {
  setDurationRowState(durationEnabledEl.checked);
  chrome.storage.sync.set({ [KEYS.durationEnabled]: durationEnabledEl.checked }, showSaved);
});

slopEnabledEl.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEYS.slopEnabled]: slopEnabledEl.checked }, showSaved);
});

// Debounces saves so storage isn't written on every keystroke.
minDurationEl.addEventListener("input", () => {
  const minutes = parseFloat(minDurationEl.value);
  if (isNaN(minutes) || minutes < 0) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.sync.set({ [KEYS.duration]: Math.round(minutes * 60) }, showSaved);
  }, 400);
});

hideIgReelsEl.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEYS.hideIgReels]: hideIgReelsEl.checked }, showSaved);
});

hideIgExploreEl.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEYS.hideIgExplore]: hideIgExploreEl.checked }, showSaved);
});

hideTiktokEl.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEYS.hideTiktok]: hideTiktokEl.checked }, showSaved);
});

labelModeEl.addEventListener("change", () => {
  chrome.storage.sync.set({ [KEYS.labelMode]: labelModeEl.checked }, showSaved);
  setLabelExportState(labelModeEl.checked);
});

// Serialises the stored dataset to JSON and triggers a file download.
exportDatasetEl.addEventListener("click", () => {
  chrome.storage.local.get("slopfilter_dataset", (r) => {
    const dataset = r["slopfilter_dataset"] || [];
    const json = JSON.stringify(dataset, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "shorts-dataset/dataset.json", saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showSaved();
  });
});

// Wipes all labeled entries from local storage after user confirmation.
clearDatasetEl.addEventListener("click", () => {
  if (!confirm("Clear all labeled data? This cannot be undone.")) return;
  chrome.storage.local.set({ slopfilter_dataset: [] }, () => {
    refreshLabelCount();
    showSaved();
  });
});
