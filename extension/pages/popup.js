const W = self.WHY;
const $ = (id) => document.getElementById(id);

let settings = { ...W.DEFAULT_SETTINGS };
let passes = {};
let stats = null;
let research = null;

async function load() {
  const r = await chrome.storage.local.get(["settings", "passes", "stats", "research"]);
  research = r.research ?? null;
  settings = { ...W.DEFAULT_SETTINGS, ...(r.settings ?? {}) };
  passes = r.passes ?? {};
  stats = r.stats ?? null;
  render();
}

function renderResearch() {
  const el = $("research");
  if (W.researchOn(research)) {
    el.innerHTML = `<div class="rs"><span style="font-size:20px">🔬</span><div class="info"><div class="d"></div><div class="r">Research mode · links open</div></div><span class="t"></span><button>Done</button></div>`;
    el.querySelector(".d").textContent = research.topic;
    el.querySelector(".t").dataset.until = research.until;
    el.querySelector("button").addEventListener("click", () => chrome.runtime.sendMessage({ type: "research:end" }));
  } else {
    el.innerHTML = `<button class="go">🔬 Research mode</button>`;
    el.querySelector("button").addEventListener("click", () => {
      chrome.tabs.create({ url: "pages/research.html" });
      window.close();
    });
  }
}

function render() {
  renderResearch();
  const live = Object.entries(W.activePasses(passes)).sort((a, b) => a[1].until - b[1].until);
  if (!live.length) {
    $("sites").innerHTML = `<div class="empty"><b>🔒</b>Everything is closed. Visit any site to ask for it.</div>`;
  } else {
    $("sites").replaceChildren(
      ...live.map(([site, p]) => {
        const r = W.reasonOf(p.reason);
        const row = document.createElement("div");
        row.className = "site";
        row.innerHTML = `<span class="e"></span><div class="info"><div class="d"></div><div class="r"></div></div><span class="t"></span><button title="Close it now">Close</button>`;
        row.querySelector(".e").textContent = r.emoji;
        row.querySelector(".d").textContent = site + (p.linked?.length ? ` + ${p.linked.length} linked` : "");
        if (p.linked?.length) row.querySelector(".d").title = p.linked.join(", ");
        row.querySelector(".r").textContent = (p.pausedAt ? "⏸ paused · " : "") + (p.note || r.label);
        row.querySelector(".t").dataset.until = p.until;
        if (p.pausedAt) row.querySelector(".t").dataset.paused = p.pausedAt;
        row.querySelector("button").addEventListener("click", () => chrome.runtime.sendMessage({ type: "pass:close", site }));
        return row;
      }),
    );
  }
  tick();

  $("grayscale").checked = settings.grayscale;
  const vol = settings.sound ? settings.volume : 0;
  if (document.activeElement !== $("volume")) $("volume").value = vol;
  showVol(Number($("volume").value));

  const today = stats?.days?.[W.dayKey()];
  $("today").textContent = today
    ? `Today: opened ${today.opens} time${today.opens === 1 ? "" : "s"} · ${W.fmtMin(today.m)} on sites`
    : "Today: nothing opened yet 💪";
}

function tick() {
  for (const t of document.querySelectorAll(".t[data-until]")) {
    const left = Number(t.dataset.until) - Number(t.dataset.paused || Date.now());
    t.textContent = W.fmt(left);
    t.classList.toggle("last", left <= 60 * 1000);
  }
}

function showVol(v) {
  $("vol-icon").textContent = v === 0 ? "🔇" : v < 50 ? "🔉" : "🔊";
  $("vol-val").textContent = v === 0 ? "Off" : `${v}%`;
}

const save = (patch) => chrome.runtime.sendMessage({ type: "settings:save", settings: patch });
$("grayscale").addEventListener("change", (e) => save({ grayscale: e.target.checked }));
$("volume").addEventListener("input", (e) => showVol(Number(e.target.value)));
$("volume").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  save(v ? { sound: true, volume: v } : { sound: false });
});
$("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

chrome.storage.onChanged.addListener((_, area) => area === "local" && load());
setInterval(() => {
  if (Object.values(passes).some((p) => !W.passLive(p)) || (research && research.until <= Date.now())) return load();
  tick();
}, 500);
load();
