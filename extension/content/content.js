// On a site you unlocked: a floating timer with your reason, and the page in black & white.
(() => {
  if (window.top !== window || window.__whyBhai) return;
  window.__whyBhai = true;
  const W = self.WHY;
  const site = W.siteOf(location.hostname);

  let settings = { ...W.DEFAULT_SETTINGS };
  let pass = null;
  let research = null;
  let pill = { right: 16, bottom: 16, min: false };
  let open = false;
  let dragging = false;

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => ({ ok: false }));

  chrome.storage.local.get(["settings", "passes", "pill", "research"]).then((r) => {
    settings = { ...W.DEFAULT_SETTINGS, ...(r.settings ?? {}) };
    pass = r.passes?.[site] ?? null;
    research = r.research ?? null;
    pill = { ...pill, ...(r.pill ?? {}) };
    render();
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.settings) settings = { ...W.DEFAULT_SETTINGS, ...(ch.settings.newValue ?? {}) };
    if (ch.passes) pass = ch.passes.newValue?.[site] ?? null;
    if (ch.research) research = ch.research.newValue ?? null;
    if (ch.pill && !dragging) pill = { ...pill, ...(ch.pill.newValue ?? {}) };
    render();
  });

  const CIRC = 2 * Math.PI * 15;
  let host = null;
  let els = null;
  let timer = null;
  let checkedFor = null;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .gray { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
      backdrop-filter: grayscale(1); -webkit-backdrop-filter: grayscale(1); opacity: 0; transition: opacity 1.2s ease; }
    .gray.on { opacity: 1; }
    .dock { position: fixed; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 6px; border-radius: 999px; border: 0;
      background: #1e1b2e; color: #fafaf9; cursor: grab; user-select: none; touch-action: none;
      box-shadow: 0 6px 20px rgba(0,0,0,.28); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
    .pill:active { cursor: grabbing; }
    .pill:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
    .ring { position: relative; width: 30px; height: 30px; flex: none; display: grid; place-items: center; font-size: 14px; }
    .ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 3.5; }
    .track { stroke: rgba(255,255,255,.14); }
    .prog { stroke: #a78bfa; stroke-linecap: round; transition: stroke-dashoffset .5s linear; }
    .last .prog { stroke: #f87171; }
    .last .pill { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { box-shadow: 0 6px 20px rgba(0,0,0,.28), 0 0 0 0 rgba(248,113,113,.6); }
                       50% { box-shadow: 0 6px 20px rgba(0,0,0,.28), 0 0 0 8px rgba(248,113,113,0); } }
    .min .pill { padding: 6px; }
    .min .time { display: none; }
    .panel { display: none; background: #1e1b2e; color: #fafaf9; border-radius: 14px; padding: 12px 14px; min-width: 220px; max-width: 280px;
      box-shadow: 0 10px 30px rgba(0,0,0,.3); font-size: 13px; line-height: 1.4; }
    .open .panel { display: block; }
    .label { font-weight: 700; overflow-wrap: anywhere; }
    .sub { color: #a8a29e; font-size: 12px; margin-top: 2px; }
    .actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
    .actions button { font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 999px;
      border: 1px solid #3f3a55; background: #2a2640; color: #fafaf9; padding: 6px 10px; }
    .actions button:hover { border-color: #a78bfa; }
    .actions button.primary { background: #a78bfa; border-color: #a78bfa; color: #1e1b2e; }
    .nopill .pill, .nopill .panel { display: none; }
    @media (prefers-reduced-motion: reduce) { .pill { animation: none !important; } .gray { transition: none; } }
  `;

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("why-bhai");
    host.style.cssText = "all: initial;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="gray"></div>
      <div class="dock">
        <div class="panel">
          <div class="label"></div>
          <div class="sub"></div>
          <div class="actions">
            <button data-act="done" class="primary">✓ Done — close it</button>
            <button data-act="min">Minimize</button>
          </div>
        </div>
        <button class="pill" title="Why Bhai? — drag to move, click for details">
          <span class="ring"><svg viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="15"/><circle class="prog" cx="18" cy="18" r="15"/></svg><span class="emoji"></span></span>
          <span class="time"></span>
        </button>
      </div>`;
    const $ = (s) => root.querySelector(s);
    els = { done: $("[data-act=done]"), gray: $(".gray"), dock: $(".dock"), pill: $(".pill"), time: $(".time"), emoji: $(".emoji"), prog: $(".prog"), label: $(".label"), sub: $(".sub") };
    els.prog.style.strokeDasharray = String(CIRC);
    wireDrag();
    root.addEventListener("click", async (e) => {
      const act = e.target.closest?.("[data-act]")?.dataset.act;
      if (act === "min") {
        pill.min = true;
        open = false;
        chrome.storage.local.set({ pill: { ...pill } });
        update();
      } else if (act === "done") {
        send(view()?.kind === "research" ? { type: "research:end" } : { type: "pass:close", site });
      }
    });
    document.documentElement.appendChild(host);
    place();
  }

  function place() {
    if (!els) return;
    els.dock.style.right = Math.min(Math.max(4, innerWidth - 60), Math.max(4, pill.right)) + "px";
    els.dock.style.bottom = Math.min(Math.max(4, innerHeight - 50), Math.max(4, pill.bottom)) + "px";
  }
  addEventListener("resize", place);

  function wireDrag() {
    let start = null;
    els.pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, right: pill.right, bottom: pill.bottom, moved: false };
      els.pill.setPointerCapture(e.pointerId);
    });
    els.pill.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 5) return;
      start.moved = dragging = true;
      pill.right = start.right - dx;
      pill.bottom = start.bottom - dy;
      place();
    });
    els.pill.addEventListener("pointerup", () => {
      if (!start) return;
      const moved = start.moved;
      start = null;
      dragging = false;
      if (moved) chrome.storage.local.set({ pill: { ...pill } });
      else if (pill.min) {
        pill.min = false;
        chrome.storage.local.set({ pill: { ...pill } });
      } else {
        open = !open;
        update();
      }
    });
    els.pill.addEventListener("pointercancel", () => {
      start = null;
      dragging = false;
    });
  }

  // What this page is open on: its own pass, or research mode (allowlisted pages show nothing).
  function view() {
    const now = Date.now();
    if (pass && pass.until > now) {
      const r = W.reasonOf(pass.reason);
      return { kind: "pass", until: pass.until, minutes: pass.minutes, emoji: r.emoji, label: `${r.emoji} ${pass.note || r.label}`,
        sub: `${site} · ${pass.minutes} min · closes when the timer ends`, done: "✓ Done — close it", gray: settings.grayscale };
    }
    const allowed = settings.allowlist.some((d) => location.hostname === d || location.hostname.endsWith("." + d));
    if (W.researchOn(research, now) && !allowed) {
      return { kind: "research", until: research.until, minutes: research.minutes, emoji: "🔬", label: `🔬 ${research.topic}`,
        sub: "Research mode · links open until the timer ends", done: "✓ Done researching", gray: false };
    }
    return null;
  }

  function update() {
    const v = view();
    if (!els || !v) return;
    const left = Math.max(0, v.until - Date.now());
    els.dock.className = ["dock", left <= 60 * 1000 ? "last" : "", pill.min ? "min" : "", open && !pill.min ? "open" : "", settings.showPill ? "" : "nopill"].join(" ");
    els.gray.classList.toggle("on", !!v.gray);
    els.emoji.textContent = v.emoji;
    els.time.textContent = W.fmt(left);
    els.prog.style.strokeDashoffset = String(CIRC * (1 - left / (v.minutes * W.MIN)));
    els.label.textContent = v.label;
    els.sub.textContent = v.sub;
    els.done.textContent = v.done;
  }

  function render() {
    if (!view()) {
      // Time ran out but the worker hasn't caught up (alarms can lag): nudge it once.
      const due = [pass?.until, research?.until].filter((t) => t && t <= Date.now()).sort().pop();
      if (due && checkedFor !== due) {
        checkedFor = due;
        send({ type: "check" });
      }
      host?.remove();
      host = els = null;
      clearInterval(timer);
      timer = null;
      return;
    }
    ensureHost();
    place();
    update();
    timer ??= setInterval(() => (view() ? update() : render()), 500);
  }
})();
