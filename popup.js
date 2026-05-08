const STORAGE_KEY = "slopfilter_min_duration_seconds";
const DEFAULT_SECONDS = 3 * 60;

const input = document.getElementById("min-duration");
const status = document.getElementById("status");

let saveTimer = null;

function showSaved() {
  status.textContent = "Saved";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { status.textContent = ""; }, 1500);
}

// Load stored value on open
chrome.storage.sync.get(STORAGE_KEY, (result) => {
  const seconds = result[STORAGE_KEY] ?? DEFAULT_SECONDS;
  input.value = Math.round(seconds / 60);
});

// Save on change with a short debounce
input.addEventListener("input", () => {
  const minutes = parseFloat(input.value);
  if (isNaN(minutes) || minutes < 0) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const seconds = Math.round(minutes * 60);
    chrome.storage.sync.set({ [STORAGE_KEY]: seconds }, showSaved);
  }, 400);
});
