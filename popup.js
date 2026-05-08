document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

const KEYS = {
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
const statusEl = document.getElementById("status");

let saveTimer = null;

function showSaved() {
  statusEl.textContent = "Saved";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { statusEl.textContent = ""; }, 1500);
}

function setDurationRowState(enabled) {
  durationRowEl.classList.toggle("disabled", !enabled);
}

chrome.storage.sync.get(Object.values(KEYS), (result) => {
  hideShortsEl.checked = result[KEYS.hideShorts] ?? true;
  durationEnabledEl.checked = result[KEYS.durationEnabled] ?? true;
  slopEnabledEl.checked = result[KEYS.slopEnabled] ?? true;
  minDurationEl.value = Math.round((result[KEYS.duration] ?? DEFAULT_SECONDS) / 60);
  hideIgReelsEl.checked = result[KEYS.hideIgReels] ?? true;
  hideIgExploreEl.checked = result[KEYS.hideIgExplore] ?? true;
  hideTiktokEl.checked = result[KEYS.hideTiktok] ?? true;
  setDurationRowState(durationEnabledEl.checked);
});

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
