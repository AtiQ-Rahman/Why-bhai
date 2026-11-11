import { runBreaths } from "./breath.js";

const W = self.WHY;
const $ = (id) => document.getElementById(id);
let topic = "";

function showError(msg) {
  $("err").hidden = false;
  $("err").textContent = msg;
}

function showRunning(r) {
  for (const id of ["breath-box", "topic-step", "long"]) $(id).hidden = true;
  $("running").hidden = false;
  $("title").textContent = "Researching 🔬";
  $("intro").textContent = "Links open freely until the timer ends. Open a new tab and go — this page can stay open.";
  $("running-topic").replaceChildren("Topic: ", Object.assign(document.createElement("b"), { textContent: r.topic }));
  const tick = () => {
    const left = r.until - Date.now();
    $("left").textContent = W.fmt(left);
    if (left <= 0) location.reload();
  };
  tick();
  setInterval(tick, 500);
}

$("topic-next").addEventListener("click", () => {
  topic = $("topic").value.trim();
  if (!topic) return $("topic").focus();
  $("topic-step").hidden = true;
  $("long").hidden = false;
  history.pushState({ step: "long" }, "");
});
// Browser Back (or the link) from the time step returns to the topic.
addEventListener("popstate", () => {
  if (history.state?.step === "long" || $("long").hidden) return;
  $("long").hidden = true;
  $("topic-step").hidden = false;
  $("topic").focus();
});
$("long-back").addEventListener("click", () => history.back());
$("topic").addEventListener("keydown", (e) => e.key === "Enter" && $("topic-next").click());
$("mins").replaceChildren(
  ...W.RESEARCH_MINUTES.map((m) => {
    const b = document.createElement("button");
    b.innerHTML = `${m}<small>min</small>`;
    b.addEventListener("click", async () => {
      const r = await chrome.runtime.sendMessage({ type: "research:start", topic, minutes: m });
      if (!r?.ok) return showError(r?.error ?? "Can't start.");
      // Straight to Google, already searching the topic. The floating pill shows the timer.
      location.replace(`https://www.google.com/search?q=${encodeURIComponent(topic)}`);
    });
    return b;
  }),
);
$("end").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "research:end" });
  location.reload();
});

async function init() {
  const { research, settings } = await chrome.storage.local.get(["research", "settings"]);
  if (W.researchOn(research)) return showRunning(research);
  const block = ({ ...W.DEFAULT_SETTINGS, ...settings }).distracting;
  $("intro").textContent = block.length
    ? `Every link opens freely for a while — except ${block.join(", ")}, which still ask why.`
    : "Every link opens freely for a while.";
  const r = await chrome.runtime.sendMessage({ type: "research:begin" });
  if (!r?.ok) return showError(r?.error ?? "Can't start.");
  if (r.running) return location.reload();
  $("breath-box").hidden = false;
  runBreaths({ ball: $("ball"), count: $("count"), label: $("label"), sub: $("bsub") }, r.breaths, () => {
    $("breath-box").hidden = true;
    $("topic-step").hidden = false;
    $("topic").focus();
  });
}
init();
