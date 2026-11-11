import { runBreaths } from "./breath.js";

const W = self.WHY;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// The URL the user was going to (after "#").
const target = (() => {
  const raw = location.hash.slice(1);
  return W.siteOfUrl(raw) ? raw : null;
})();
const site = target ? W.siteOfUrl(target) : null;

let reason = null;
let note = "";
let extraBreaths = 3; // one more set for "Just bored"

function showError(msg) {
  $("err").hidden = false;
  $("err").textContent = msg;
}

const go = () => location.replace(target);
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th");
const breathEls = () => ({ ball: $("ball"), count: $("count"), label: $("label"), sub: $("bsub") });

async function begin() {
  $("begin").hidden = true;
  $("err").hidden = true;
  const r = await chrome.runtime.sendMessage({ type: "gate:begin", url: target });
  if (!r?.ok) return showError(r?.error ?? "Can't open this.");
  if (r.open) return go();
  extraBreaths = r.extra;
  if (r.opensThisHour >= W.REPEAT_FREE) {
    $("repeat").hidden = false;
    $("repeat").textContent = `${ordinal(r.opensThisHour + 1)} time on ${site} this hour — ${r.breaths} breaths this time.`;
  }
  $("breath-box").hidden = false;
  runBreaths(breathEls(), r.breaths, () => {
    $("breath-box").hidden = true;
    $("why").hidden = false;
  });
}

// Step 2: why?
$("reasons").replaceChildren(
  ...W.REASONS.map((r) => {
    const b = document.createElement("button");
    const e = document.createElement("span");
    e.className = "e";
    e.textContent = r.emoji;
    b.append(e, r.label);
    b.addEventListener("click", () => {
      reason = r.id;
      for (const x of $("reasons").children) x.classList.toggle("selected", x === b);
      const other = r.id === "other";
      $("note").hidden = $("note-next").hidden = !other;
      if (other) return $("note").focus();
      note = "";
      if (r.extraBreaths) return boredBreaths();
      showLong();
    });
    return b;
  }),
);
const submitNote = () => {
  note = $("note").value.trim();
  if (!note) return $("note").focus();
  showLong();
};
$("note-next").addEventListener("click", submitNote);
$("note").addEventListener("keydown", (e) => e.key === "Enter" && submitNote());

// Steps after "why?" get their own history entry, so the browser's Back button
// returns to the reasons instead of leaving the page.
function pushStep() {
  if (history.state?.step !== "after-why") history.pushState({ step: "after-why" }, "");
}
let stopBored = null;
function showWhy() {
  stopBored?.();
  stopBored = null;
  $("breath-box").hidden = true;
  $("long").hidden = true;
  $("why").hidden = false;
  for (const x of $("reasons").children) x.classList.remove("selected");
  $("note").hidden = $("note-next").hidden = true;
}
addEventListener("popstate", () => {
  if (history.state?.step !== "after-why" && $("why").hidden && (!$("long").hidden || stopBored)) showWhy();
});
$("long-back").addEventListener("click", () => history.back());

// "Just bored" costs one more set of breaths.
function boredBreaths() {
  pushStep();
  $("why").hidden = true;
  $("breath-box").hidden = false;
  stopBored = runBreaths(breathEls(), extraBreaths, () => {
    stopBored = null;
    $("breath-box").hidden = true;
    showLong();
  }, (n, total) => `Bored tax: breath ${n} of ${total} 🫠`);
}

// Step 3: how long? Only the times that fit the reason.
function showLong() {
  pushStep();
  const r = W.reasonOf(reason);
  $("why").hidden = true;
  $("long").hidden = false;
  $("chosen").replaceChildren(`${r.emoji} `, Object.assign(document.createElement("b"), { textContent: note || r.label }));
  $("mins").replaceChildren(...r.minutes.map(minuteButton));
}
function minuteButton(m) {
  const b = document.createElement("button");
  b.innerHTML = `${m}<small>min</small>`;
  b.addEventListener("click", async () => {
    const r = await chrome.runtime.sendMessage({ type: "gate:open", url: target, reason, note, minutes: m });
    if (!r?.ok) return showError(r?.error ?? "Can't open this.");
    go();
  });
  return b;
}
$("begin").addEventListener("click", begin);

async function init() {
  if (!target) {
    $("site").textContent = "Nothing to open here.";
    return;
  }
  const { settings, passes, research, feedback } = await chrome.storage.local.get(["settings", "passes", "research", "feedback"]);
  if (W.routeUrl(target, { ...W.DEFAULT_SETTINGS, ...settings }, passes, research) === "open") return go();

  document.title = `${site}? — Why Bhai?`;
  $("site").replaceChildren(Object.assign(document.createElement("b"), { textContent: site }), " is closed. Breathe first, then tell me why.");
  if (params.has("timesup")) {
    $("title").textContent = "Time's up ⏰";
    $("site").replaceChildren(Object.assign(document.createElement("b"), { textContent: site }), " closed again. Need it once more? Breathe first.");
  } else if (params.has("closed")) {
    $("title").textContent = "Closed. Nice one 👍";
    $("site").replaceChildren(Object.assign(document.createElement("b"), { textContent: site }), " is closed again.");
  }

  if (params.has("researchdone")) {
    $("title").textContent = "Research time's up 🔬";
    $("site").replaceChildren(Object.assign(document.createElement("b"), { textContent: site }), " is closed again. Need it? Breathe first.");
  }

  // Just closed: ask whether it was worth it, then offer the way back in.
  const f = feedback?.[site];
  if ((params.has("timesup") || params.has("closed")) && f) {
    const r = W.reasonOf(f.reason);
    $("ask").hidden = false;
    $("ask-why").replaceChildren(`You opened it to: ${r.emoji} `, Object.assign(document.createElement("b"), { textContent: f.note || r.label }));
    const answer = async (got) => {
      await chrome.runtime.sendMessage({ type: "pass:feedback", site, got });
      $("ask").hidden = true;
      $("begin").hidden = false;
      $("site").textContent = got ? "Nice 👍 Need it again? Breathe first." : "Okay. Need it again? Breathe first.";
    };
    $("ask-yes").onclick = () => answer(true);
    $("ask-no").onclick = () => answer(false);
    return;
  }

  // Auto-start only when someone is actually looking at this tab, and not right after time's up.
  const auto = !params.has("timesup") && !params.has("closed") && !params.has("researchdone");
  if (!auto) return ($("begin").hidden = false);
  if (document.visibilityState === "visible") return begin();
  $("begin").hidden = false;
  document.addEventListener("visibilitychange", function once() {
    if (document.visibilityState !== "visible" || !$("breath-box").hidden || !$("why").hidden) return;
    document.removeEventListener("visibilitychange", once);
    begin();
  });
}

// Another tab may open this site meanwhile: then just go.
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area !== "local" || !(ch.passes || ch.research) || !target) return;
  const { settings, passes, research } = await chrome.storage.local.get(["settings", "passes", "research"]);
  if (W.routeUrl(target, { ...W.DEFAULT_SETTINGS, ...settings }, passes, research) === "open") go();
});

init();
