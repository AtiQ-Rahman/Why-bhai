const W = self.WHY;
const $ = (id) => document.getElementById(id);
const DAY = 24 * 60 * 60 * 1000;
const times = (n, skipped = 0) => `opened ${n} time${n === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped 👍` : ""}`;

function list(el, rows, fmt) {
  const max = Math.max(0, ...rows.map((r) => r.v));
  if (!rows.length) {
    el.innerHTML = `<div class="empty">Nothing yet.</div>`;
    return;
  }
  el.replaceChildren(
    ...rows.map((r) => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `<span class="name"></span><span class="val"></span><span class="track"><span class="fill"></span></span>`;
      item.querySelector(".name").textContent = r.name;
      item.querySelector(".val").textContent = fmt(r.v);
      item.querySelector(".fill").style.width = max ? `${(r.v / max) * 100}%` : "0";
      return item;
    }),
  );
}

async function render() {
  const { stats } = await chrome.storage.local.get("stats");
  const days = stats?.days ?? {};
  const week = Array.from({ length: 7 }, (_, i) => days[W.dayKey(Date.now() - i * DAY)]).filter(Boolean);
  const today = days[W.dayKey()] ?? { opens: 0, m: 0 };
  const sum = (k) => week.reduce((a, d) => a + d[k], 0);

  $("today").textContent = W.fmtMin(today.m);
  $("today-s").textContent = times(today.opens, today.skipped);
  $("week").textContent = W.fmtMin(sum("m"));
  $("week-s").textContent = times(sum("opens"), week.reduce((a, d) => a + (d.skipped ?? 0), 0));
  $("total").textContent = W.fmtMin(stats?.total?.m ?? 0);
  $("total-s").textContent = times(stats?.total?.opens ?? 0, stats?.total?.skipped ?? 0);

  const rWeek = week.reduce((a, d) => a + (d.research?.m ?? 0), 0);
  $("research").textContent = W.fmtMin(rWeek);
  $("research-s").textContent = `last 7 days · ${W.fmtMin(stats?.total?.research ?? 0)} all time`;

  const worked = {};
  const topics = {};
  const missed = [];
  for (const d of week) {
    missed.push(...(d.missed ?? []).slice().reverse());
    for (const [k, v] of Object.entries(d.worked ?? {})) {
      const w = (worked[k] ??= { yes: 0, no: 0 });
      w.yes += v.yes;
      w.no += v.no;
    }
    for (const [k, v] of Object.entries(d.research?.topics ?? {})) topics[k] = (topics[k] ?? 0) + v;
  }
  list(
    $("worked"),
    Object.entries(worked)
      .map(([name, w]) => ({ name, v: Math.round((100 * w.yes) / (w.yes + w.no)), n: w.yes + w.no }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8),
    (v) => `${v}% yes`,
  );
  // Newest first; just the words and the site, no bar.
  if (!missed.length) $("missed").innerHTML = `<div class="empty">Nothing yet.</div>`;
  else
    $("missed").replaceChildren(
      ...missed.slice(0, 10).map((m) => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `<span class="name"></span><span class="val muted"></span>`;
        item.querySelector(".name").textContent = `🙃 ${m.note}`;
        item.querySelector(".val").textContent = m.site;
        return item;
      }),
    );
  list($("topics"), Object.entries(topics).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v).slice(0, 8), W.fmtMin);

  const sites = {};
  for (const d of week) {
    for (const [k, v] of Object.entries(d.sites ?? {})) sites[k] = (sites[k] ?? 0) + v;
  }
  list($("sites"), Object.entries(sites).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v).slice(0, 8), W.fmtMin);
}

chrome.storage.onChanged.addListener((ch, area) => area === "local" && ch.stats && render());
render();
