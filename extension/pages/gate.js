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

let reason = "other"; // "other": the reason you wrote; "lookup": a search
let note = "";
const MIN_NOTE = 3; // characters: a few words, not a keystroke

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
  if (r.search) return showSearch();
  if (r.opensThisHour >= W.REPEAT_FREE) {
    $("repeat").hidden = false;
    $("repeat").textContent = `${ordinal(r.opensThisHour + 1)} time on ${site} this hour — ${r.breaths} breaths this time.`;
  }
  $("breath-box").hidden = false;
  runBreaths(breathEls(), r.breaths, () => {
    $("breath-box").hidden = true;
    showWhy();
  });
}

// Step 2: why? In your own words.
function showWhy() {
  $("long").hidden = true;
  $("why").hidden = false;
  $("note").focus();
}
const submitNote = () => {
  note = $("note").value.trim();
  if (note.length < MIN_NOTE) {
    $("note").focus();
    return showError("Write why, in a few words.");
  }
  $("err").hidden = true;
  showLong();
};
$("note-next").addEventListener("click", submitNote);
$("note").addEventListener("keydown", (e) => e.key === "Enter" && submitNote());

// "How long?" gets its own history entry, so the browser's Back button
// returns to the reason instead of leaving the page.
addEventListener("popstate", () => {
  if (history.state?.step !== "after-why" && reason === "other" && !$("long").hidden) showWhy();
});
$("long-back").addEventListener("click", () => history.back());

// A search from the address bar: no breathing, no reason (the search is the reason).
function showSearch() {
  reason = "lookup";
  note = W.searchQuery(target).slice(0, 140);
  $("site").replaceChildren("Searching ", Object.assign(document.createElement("b"), { textContent: site }), ".");
  $("long-back").hidden = true;
  showMinutes();
}

// Step 3: how long?
function showLong() {
  if (history.state?.step !== "after-why") history.pushState({ step: "after-why" }, "");
  $("why").hidden = true;
  showMinutes();
}
function showMinutes() {
  $("long").hidden = false;
  $("chosen").replaceChildren(`${W.reasonOf(reason).emoji} `, Object.assign(document.createElement("b"), { textContent: note }));
  $("mins").replaceChildren(...W.MINUTES.map(minuteButton));
  $("custom-min").max = W.MAX_MINUTES;
  $("custom-min").value = "";
}
async function open(minutes) {
  const r = await chrome.runtime.sendMessage({ type: "gate:open", url: target, reason, note, minutes });
  if (!r?.ok) return showError(r?.error ?? "Can't open this.");
  go();
}
function minuteButton(m) {
  const b = document.createElement("button");
  b.innerHTML = `${m}<small>min</small>`;
  b.addEventListener("click", () => open(m));
  return b;
}
// Or any whole number of minutes.
function openCustom() {
  const m = Number($("custom-min").value);
  if (!Number.isInteger(m) || m < 1 || m > W.MAX_MINUTES) {
    $("custom-min").focus();
    return showError(`Pick 1 to ${W.MAX_MINUTES} minutes.`);
  }
  open(m);
}
$("custom-go").addEventListener("click", openCustom);
$("custom-min").addEventListener("keydown", (e) => e.key === "Enter" && openCustom());
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
  if (W.searchQuery(target)) {
    $("site").replaceChildren(Object.assign(document.createElement("b"), { textContent: site }), " is closed. A quick search? Just pick how long.");
    $("begin").textContent = "🔍 Pick how long";
  }
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
