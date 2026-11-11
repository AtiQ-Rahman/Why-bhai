// Why Bhai? service worker: every site starts closed. A site opens only after a breath,
// a reason and a time limit (a "pass"). This worker owns the passes, the blocking rules,
// the ticking clock, the beep, the badge and the stats.
import "./shared.js";

const W = self.WHY;
const { MIN } = W;
const GATE_PAGE = chrome.runtime.getURL("pages/gate.html");

// ---------- storage ----------

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...W.DEFAULT_SETTINGS, ...(settings ?? {}) };
}

// passes = { "youtube.com": { until, startedAt, minutes, reason, note } }
async function getPasses() {
  const { passes } = await chrome.storage.local.get("passes");
  return passes ?? {};
}

async function getResearch() {
  const { research } = await chrome.storage.local.get("research");
  return research ?? null;
}

async function getState() {
  const r = await chrome.storage.local.get(["settings", "passes", "research"]);
  return { settings: { ...W.DEFAULT_SETTINGS, ...(r.settings ?? {}) }, passes: r.passes ?? {}, research: r.research ?? null };
}

// Every state change goes through this queue so alarms, messages and tab events can't race.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch((e) => console.error("[Why Bhai]", e));
  return run;
}

// ---------- blocking ----------

const esc = (d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Priorities: allowlist (5) > open passes (4) > research-blocked sites go to the gate (3)
// > research mode opens everything (2) > everything goes to the gate (1).
async function applyRules(settings, passes, research) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  let id = 1;
  const addRules = [];
  const rule = (priority, action, condition) => addRules.push({ id: id++, priority, action, condition });
  const toGate = { type: "redirect", redirect: { regexSubstitution: GATE_PAGE + "#\\1" } };
  rule(1, toGate, { regexFilter: "^(https?://.*)$", resourceTypes: ["main_frame"] });
  if (W.researchOn(research)) {
    rule(2, { type: "allow" }, { regexFilter: "^https?://", resourceTypes: ["main_frame"] });
    for (const d of settings.distracting) {
      rule(3, toGate, { regexFilter: `^(https?://([a-z0-9-]+\\.)*${esc(d)}(:[0-9]+)?([/?#].*)?)$`, resourceTypes: ["main_frame"] });
    }
  }
  for (const d of Object.keys(W.activePasses(passes))) {
    rule(4, { type: "allow" }, { urlFilter: `||${d}^`, resourceTypes: ["main_frame"] });
  }
  for (const d of settings.allowlist) {
    rule(5, { type: "allow" }, { urlFilter: `||${d}^`, resourceTypes: ["main_frame"] });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules });
}

// Tabs already showing a site that isn't open go to the gate. `only`: limit to these sites.
async function sweepTabs(settings, passes, research, only = null, param = "") {
  for (const t of await chrome.tabs.query({})) {
    const url = t.url || t.pendingUrl;
    if (!url || !/^https?:/i.test(url)) continue;
    if (only && !only.includes(W.siteOfUrl(url))) continue;
    if (W.routeUrl(url, settings, passes, research) === "open") continue;
    // Closed on purpose ("Done"): back to the new tab page instead of the gate.
    const next = param === "home" ? "chrome://newtab/" : `${GATE_PAGE}${param}#${url}`;
    chrome.tabs.update(t.id, { url: next }).catch(() => {});
  }
}

// ---------- sound ----------

async function ensureOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: "pages/offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Ticking clock while a site is open, the time's-up beep and the breathing sound",
    });
  } catch {
    // Another call created it first.
  }
}

async function toOffscreen(msg) {
  const st = await getSettings();
  if (!st.sound || !st.volume) return;
  await ensureOffscreen();
  chrome.runtime.sendMessage({ ...msg, volume: st.volume }).catch(() => {});
}

// Tick only for the site in the tab you're looking at.
async function syncTicking() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const site = tab?.url ? W.siteOfUrl(tab.url) : null;
  const pass = site ? W.activePasses(await getPasses())[site] : null;
  if (pass) return toOffscreen({ type: "offscreen:tick", on: true, endsAt: pass.until });
  if (await chrome.offscreen.hasDocument().catch(() => false)) {
    chrome.runtime.sendMessage({ type: "offscreen:tick", on: false }).catch(() => {});
  }
}

// ---------- badge + alarms ----------

async function updateBadge(passes, research) {
  const n = Object.keys(W.activePasses(passes)).length;
  const r = W.researchOn(research);
  await chrome.action.setBadgeBackgroundColor({ color: r ? "#0f766e" : "#6d28d9" });
  await chrome.action.setBadgeText({ text: r ? "R" : n ? String(n) : "" });
  await chrome.action.setTitle({
    title: r
      ? `Why Bhai? — researching “${research.topic}”`
      : n ? `Why Bhai? — ${n} site${n > 1 ? "s" : ""} open` : "Why Bhai? — everything is closed",
  });
}

async function schedule(passes, research) {
  await chrome.alarms.clearAll();
  const ends = Object.values(W.activePasses(passes)).map((p) => p.until);
  if (W.researchOn(research)) ends.push(research.until);
  if (!ends.length) return;
  chrome.alarms.create("next", { when: Math.min(...ends) });
  chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 }); // in case an alarm lags
}

// ---------- stats ----------
// stats = { days: { "YYYY-MM-DD": { opens, m, sites: { site: min }, reasons: { id: count },
//                      feedback: { reasonId: { yes, no } }, research: { m, topics: { topic: min } } } },
//           total: { opens, m, research } }

async function updateStats(fn, at = Date.now()) {
  const { stats: raw } = await chrome.storage.local.get("stats");
  const stats = raw?.days ? raw : { days: {}, total: { opens: 0, m: 0, research: 0 } };
  stats.total.research ??= 0;
  const key = W.dayKey(at);
  const d = (stats.days[key] ??= { opens: 0, m: 0, sites: {}, reasons: {} });
  d.feedback ??= {};
  d.research ??= { m: 0, topics: {} };
  fn(d, stats.total);
  const keys = Object.keys(stats.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete stats.days[k];
  await chrome.storage.local.set({ stats });
}

const round1 = (x) => Math.max(0, Math.round(x * 10) / 10);

// ---------- state changes ----------

async function commit(passes, research, sweep = null) {
  await chrome.storage.local.set({ passes, research });
  const settings = await getSettings();
  await applyRules(settings, passes, research);
  if (sweep) await sweepTabs(settings, passes, research, sweep.only, sweep.param);
  await schedule(passes, research);
  await updateBadge(passes, research);
  await syncTicking();
}

// Close passes that ran out (or the ones named in `sites`, closed early by the user),
// and research mode if it ran out (or `endResearch`).
function closeDue({ sites = null, endResearch = false } = {}) {
  return serial(async () => {
    const { passes, research } = await getState();
    const now = Date.now();
    const closing = Object.keys(passes).filter((s) => (sites ? sites.includes(s) : passes[s].until <= now));
    const researchDone = !!research && (endResearch || research.until <= now);
    if (!closing.length && !researchDone) return { ok: true };

    const { feedback } = await chrome.storage.local.get("feedback");
    const ask = { ...(feedback ?? {}) };
    for (const s of closing) {
      const p = passes[s];
      const end = Math.min(now, p.until);
      await updateStats((d, t) => {
        const m = round1((end - p.startedAt) / MIN);
        d.m += m;
        d.sites[s] = round1((d.sites[s] ?? 0) + m);
        t.m = round1(t.m + m);
      }, end);
      // Asked on the gate page when time runs out: "did you get what you came for?"
      if (!sites) ask[s] = { reason: p.reason, note: p.note, at: now };
      else delete ask[s];
      delete passes[s];
    }
    await chrome.storage.local.set({ feedback: ask });

    let next = research;
    if (researchDone) {
      const end = Math.min(now, research.until);
      await updateStats((d, t) => {
        const m = round1((end - research.startedAt) / MIN);
        d.research.m = round1(d.research.m + m);
        d.research.topics[research.topic] = round1((d.research.topics[research.topic] ?? 0) + m);
        t.research = round1(t.research + m);
      }, end);
      next = null;
    }

    const early = !!sites || endResearch;
    const param = early ? "home" : researchDone ? "?researchdone=1" : "?timesup=1";
    // Research ending can close any tab; a pass ending only closes its own site.
    await commit(passes, next, { only: researchDone ? null : closing, param });
    if (!early) toOffscreen({ type: "offscreen:beep" });
    return { ok: true };
  });
}

function reconcile() {
  return serial(async () => {
    const { settings, passes, research } = await getState();
    await applyRules(settings, passes, research);
    await schedule(passes, research);
    await updateBadge(passes, research);
    await syncTicking();
  }).then(() => closeDue());
}

// ---------- the gate ----------
// The gate page calls begin, breathes, then open. The worker checks the breathing really
// took that long, so a page can't skip it.

function gateBegin({ url }) {
  return serial(async () => {
    const site = W.siteOfUrl(url);
    if (!site) return { ok: false, error: "Not a website." };
    const { settings, passes, research } = await getState();
    if (W.routeUrl(url, settings, passes, research) === "open") return { ok: true, open: true };
    const { gates, recent } = await chrome.storage.local.get(["gates", "recent"]);
    const breaths = W.breathsFor(settings.breaths, recent?.[site], W.isDistracting(site, settings));
    await chrome.storage.local.set({ gates: { ...(gates ?? {}), [site]: { at: Date.now(), breaths } } });
    const opensThisHour = W.isDistracting(site, settings) ? (recent?.[site] ?? []).filter((t) => Date.now() - t < 60 * MIN).length : 0;
    return { ok: true, site, breaths, extra: settings.breaths, opensThisHour };
  });
}

function gateOpen({ url, reason, note, minutes }) {
  return serial(async () => {
    const site = W.siteOfUrl(url);
    if (!site) return { ok: false, error: "Not a website." };
    const { settings, passes, research } = await getState();
    if (W.routeUrl(url, settings, passes, research) === "open") return { ok: true };
    const r = W.REASONS.find((x) => x.id === reason);
    if (!r) return { ok: false, error: "Pick a reason." };
    const { gates, recent } = await chrome.storage.local.get(["gates", "recent"]);
    const g = gates?.[site];
    const need = (g?.breaths ?? 0) + (r.extraBreaths ? settings.breaths : 0);
    if (!g || Date.now() - g.at < need * W.BREATH_S * 1000 - 2000) return { ok: false, error: "Finish the breathing first." };
    const cleanNote = String(note ?? "").trim().slice(0, 140);
    if (reason === "other" && !cleanNote) return { ok: false, error: "Write the reason." };
    const min = r.minutes.includes(Number(minutes)) ? Number(minutes) : r.minutes[0];
    const now = Date.now();
    passes[site] = { until: now + min * MIN, startedAt: now, minutes: min, reason, note: cleanNote };
    delete gates[site];
    const hits = [...(recent?.[site] ?? []).filter((t) => now - t < 60 * MIN), now];
    await chrome.storage.local.set({ gates, recent: { ...(recent ?? {}), [site]: hits } });
    await updateStats((d, t) => {
      d.opens += 1;
      d.reasons[reason] = (d.reasons[reason] ?? 0) + 1;
      t.opens += 1;
    });
    await commit(passes, research);
    return { ok: true };
  });
}

// "Did you get what you came for?" after a site closes.
function feedback({ site, got }) {
  return serial(async () => {
    const { feedback: all } = await chrome.storage.local.get("feedback");
    const f = all?.[site];
    if (!f) return { ok: true };
    await updateStats((d) => {
      const fb = (d.feedback[f.reason] ??= { yes: 0, no: 0 });
      fb[got ? "yes" : "no"] += 1;
    });
    delete all[site];
    await chrome.storage.local.set({ feedback: all });
    return { ok: true };
  });
}

// ---------- research mode ----------

function researchBegin() {
  return serial(async () => {
    if (W.researchOn(await getResearch())) return { ok: true, running: true };
    const settings = await getSettings();
    await chrome.storage.local.set({ researchGate: { at: Date.now(), breaths: settings.breaths } });
    return { ok: true, breaths: settings.breaths };
  });
}

function researchStart({ topic, minutes }) {
  return serial(async () => {
    const { passes, research } = await getState();
    if (W.researchOn(research)) return { ok: true };
    const { researchGate: g } = await chrome.storage.local.get("researchGate");
    if (!g || Date.now() - g.at < g.breaths * W.BREATH_S * 1000 - 2000) return { ok: false, error: "Finish the breathing first." };
    const t = String(topic ?? "").trim().slice(0, 80);
    if (!t) return { ok: false, error: "What are you researching?" };
    const min = W.RESEARCH_MINUTES.includes(Number(minutes)) ? Number(minutes) : W.RESEARCH_MINUTES[0];
    const now = Date.now();
    await chrome.storage.local.remove("researchGate");
    await commit(passes, { until: now + min * MIN, startedAt: now, minutes: min, topic: t });
    return { ok: true };
  });
}

function saveSettings(patch, reset = false) {
  return serial(async () => {
    const d = W.DEFAULT_SETTINGS;
    const raw = reset ? { ...d } : { ...(await getSettings()), ...patch };
    const clamp = (v, lo, hi, dflt) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
    };
    const allow = Array.isArray(raw.allowlist) ? raw.allowlist.map(W.normalizeDomain).filter(Boolean) : d.allowlist;
    const settings = {
      allowlist: [...new Set(allow)],
      breaths: clamp(raw.breaths, 1, 10, d.breaths),
      grayscale: !!raw.grayscale,
      sound: !!raw.sound,
      volume: clamp(raw.volume, 0, 100, d.volume),
      showPill: !!raw.showPill,
      // (older versions called this list researchBlock)
      distracting: [...new Set((Array.isArray(raw.distracting) ? raw.distracting : Array.isArray(raw.researchBlock) ? raw.researchBlock : d.distracting).map(W.normalizeDomain).filter(Boolean))],
    };
    await chrome.storage.local.set({ settings });
    if (reset) await chrome.storage.local.remove("pill");
    const { passes, research } = await getState();
    await applyRules(settings, passes, research);
    await sweepTabs(settings, passes, research); // a site removed from the allowlist closes right away
    if (!settings.sound) chrome.runtime.sendMessage({ type: "offscreen:tick", on: false }).catch(() => {});
    else await syncTicking();
    return { ok: true, settings };
  });
}

// ---------- wiring ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const handlers = {
    "gate:begin": () => gateBegin(msg),
    "gate:open": () => gateOpen(msg),
    "pass:close": () => closeDue({ sites: [msg.site] }),
    "pass:feedback": () => feedback(msg),
    "research:begin": researchBegin,
    "research:start": () => researchStart(msg),
    "research:end": () => closeDue({ endResearch: true }),
    check: () => closeDue(),
    "settings:save": () => saveSettings(msg.settings ?? {}),
    "settings:reset": () => saveSettings({}, true),
    "breath:sound": () => toOffscreen({ type: "offscreen:breath", phase: msg.phase, seconds: msg.seconds }).then(() => ({ ok: true })),
  };
  const h = handlers[msg?.type];
  if (!h) return false;
  Promise.resolve()
    .then(h)
    .then(reply, (e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true;
});

chrome.alarms.onAlarm.addListener(() => closeDue());
chrome.tabs.onActivated.addListener(() => syncTicking());
chrome.tabs.onUpdated.addListener((_, info, tab) => info.url && tab.active && syncTicking());
chrome.windows.onFocusChanged.addListener(() => syncTicking());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) await chrome.storage.local.set({ settings: W.DEFAULT_SETTINGS });
  await reconcile();
  if (reason === "install") {
    // Everything closes from now on, including tabs that are already open.
    const { settings, passes, research } = await getState();
    await sweepTabs(settings, passes, research);
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(reconcile);
reconcile();
