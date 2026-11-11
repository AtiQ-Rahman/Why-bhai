const W = self.WHY;
const $ = (id) => document.getElementById(id);
const NUMBERS = ["breaths", "volume"];
const CHECKS = ["grayscale", "showPill", "sound"];
let settings = { ...W.DEFAULT_SETTINGS };

async function load() {
  const { settings: s } = await chrome.storage.local.get("settings");
  settings = { ...W.DEFAULT_SETTINGS, ...(s ?? {}) };
  render();
}

function render() {
  for (const k of NUMBERS) if (document.activeElement !== $(k)) $(k).value = settings[k];
  for (const k of CHECKS) $(k).checked = !!settings[k];
  $("breath-time").textContent = `About ${settings.breaths * W.BREATH_S} seconds: in for ${W.BREATH_IN_S}, out for ${W.BREATH_OUT_S}.`;
  chips("allow", "allowlist");
  chips("rb", "distracting");
}

function chips(el, key) {
  $(el).replaceChildren(
    ...settings[key].map((d) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      const x = document.createElement("button");
      x.textContent = "×";
      x.title = `Remove ${d}`;
      x.addEventListener("click", () => save({ [key]: settings[key].filter((v) => v !== d) }));
      chip.append(d, x);
      return chip;
    }),
  );
  if (!settings[key].length) $(el).textContent = "Nothing yet.";
}

let savedTimer = null;
function flash(text) {
  $("saved").textContent = text;
  $("saved").classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $("saved").classList.remove("show"), 1300);
}

async function save(patch) {
  const r = await chrome.runtime.sendMessage({ type: "settings:save", settings: patch });
  if (r?.ok) {
    settings = r.settings;
    render();
    flash("Saved ✓");
  }
}

for (const k of NUMBERS) $(k).addEventListener("change", (e) => save({ [k]: Number(e.target.value) }));
for (const k of CHECKS) $(k).addEventListener("change", (e) => save({ [k]: e.target.checked }));
$("add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = W.normalizeDomain($("add-input").value);
  $("add-err").hidden = !!d;
  if (!d) return ($("add-err").textContent = "That doesn't look like a website. Try something like stackoverflow.com");
  $("add-input").value = "";
  if (!settings.allowlist.includes(d)) save({ allowlist: [...settings.allowlist, d] });
});
$("rb-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const d = W.normalizeDomain($("rb-input").value);
  if (!d) return;
  $("rb-input").value = "";
  if (!settings.distracting.includes(d)) save({ distracting: [...settings.distracting, d] });
});
$("reset").addEventListener("click", async () => {
  if (!confirm("Reset all Why Bhai? settings to the defaults? Stats are kept.")) return;
  const r = await chrome.runtime.sendMessage({ type: "settings:reset" });
  if (r?.ok) {
    settings = r.settings;
    render();
    flash("Reset ✓");
  }
});

chrome.storage.onChanged.addListener((ch, area) => area === "local" && ch.settings && load());
load();
