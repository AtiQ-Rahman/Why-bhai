// Shared constants and helpers. Loaded as a classic script by the service worker
// (side-effect import), the content script and the extension pages; exposes self.WHY.
(() => {
  const MIN = 60 * 1000;

  // Each reason offers the times that fit it. "Just bored" costs one more set of breaths.
  const REASONS = [
    { id: "messages", label: "Check messages", emoji: "💬", minutes: [2, 5, 10] },
    { id: "lookup", label: "Look up one thing", emoji: "🔍", minutes: [2, 5] },
    { id: "work", label: "Work / study", emoji: "📚", minutes: [5, 10, 15, 30] },
    { id: "post", label: "Post or reply", emoji: "📢", minutes: [5, 10, 15] },
    { id: "bored", label: "Just bored", emoji: "🫠", minutes: [2, 5, 10], extraBreaths: true },
    { id: "other", label: "Something else", emoji: "✏️", minutes: [2, 5, 10, 15, 30] },
  ];
  const MINUTES = [2, 5, 10, 15, 30];
  const RESEARCH_MINUTES = [15, 30, 45, 60];
  // A search can also take any whole number of minutes up to this.
  const SEARCH_MAX_MINUTES = 30;
  // Opening the same site more than this many times in an hour adds a set of breaths each time.
  const REPEAT_FREE = 3;
  const REPEAT_WINDOW = 60 * MIN;
  // A pass's clock only runs while its site is on screen. Paused longer than this, it closes.
  const PAUSE_LIMIT = 30 * MIN;

  const DEFAULT_SETTINGS = {
    allowlist: ["localhost", "127.0.0.1"],
    breaths: 3, // one set of breaths before each unlock
    grayscale: true,
    sound: true,
    volume: 40,
    showPill: true,
    // Distracting sites: opening them often adds breaths, and research mode doesn't open them.
    distracting: ["youtube.com", "facebook.com", "instagram.com"],
  };

  const BREATH_IN_S = 4;
  const BREATH_OUT_S = 6;
  const BREATH_S = BREATH_IN_S + BREATH_OUT_S;

  // "https://www.Python.org/docs" -> "python.org". Returns "" if it isn't a usable host.
  function normalizeDomain(input) {
    let s = String(input ?? "").trim().toLowerCase();
    if (!s) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = "http://" + s;
    try {
      const host = new URL(s).hostname.replace(/^www\./, "").replace(/\.$/, "");
      return /^[a-z0-9.-]+$/.test(host) && !host.startsWith(".") && !host.includes("..") ? host : "";
    } catch {
      return "";
    }
  }

  // The "site" a pass covers: m.youtube.com -> youtube.com, news.bbc.co.uk -> bbc.co.uk.
  function siteOf(hostname) {
    const host = String(hostname).toLowerCase().replace(/\.$/, "");
    if (/^[\d.]+$/.test(host) || !host.includes(".")) return host; // IPs, localhost
    const parts = host.split(".");
    const two = parts.slice(-2).join(".");
    const secondLevel = /^(com|co|org|net|ac|gov|edu|or|ne|go)\.[a-z]{2}$/.test(two);
    return parts.slice(secondLevel ? -3 : -2).join(".");
  }

  const siteOfUrl = (url) => {
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) ? siteOf(u.hostname) : null;
    } catch {
      return null;
    }
  };

  const hostMatches = (host, domain) => host === domain || host.endsWith("." + domain);

  // Time left on a pass; it doesn't go down while the pass is paused (pausedAt set).
  const passLeft = (p, now = Date.now()) => Math.max(0, p.until - (p.pausedAt ?? now));
  // When a pass closes: its time runs out, or it sat paused for PAUSE_LIMIT.
  const passDueAt = (p) => (!p.pausedAt ? p.until : p.until > p.pausedAt ? p.pausedAt + PAUSE_LIMIT : p.pausedAt);
  const passLive = (p, now = Date.now()) => !!p && passDueAt(p) > now;

  // Live passes only (running or paused).
  function activePasses(passes, now = Date.now()) {
    return Object.fromEntries(Object.entries(passes ?? {}).filter(([, p]) => passLive(p, now)));
  }

  // The pass covering a site: its own, or the one it was linked to by following a link
  // from an open site (pass.linked). Prefers a live one. Returns [rootSite, pass] or null.
  function passFor(passes, site, now = Date.now()) {
    let found = null;
    for (const [root, p] of Object.entries(passes ?? {})) {
      if (root !== site && !p.linked?.includes(site)) continue;
      if (passLive(p, now)) return [root, p];
      found ??= [root, p];
    }
    return found;
  }

  // Every site a pass opens: its own and the ones linked to it.
  const passSites = (root, p) => [root, ...(p?.linked ?? [])];

  // A search on a search engine (typed in the address bar, say): its query, else null.
  // These skip the breathing and the reason: it's a quick look-up, just pick how long.
  const SEARCH_ENGINES = [
    [/^(www\.)?google\.[a-z.]+$/, /^\/search$/],
    [/^(www\.)?bing\.com$/, /^\/search$/],
    [/^(html\.)?duckduckgo\.com$/, /^\/(html\/?)?$/],
    [/^search\.brave\.com$/, /^\/search$/],
  ];
  function searchQuery(url) {
    try {
      const u = new URL(url);
      const q = u.searchParams.get("q")?.trim();
      const hit = SEARCH_ENGINES.some(([h, p]) => h.test(u.hostname.toLowerCase()) && p.test(u.pathname));
      return hit && q ? q : null;
    } catch {
      return null;
    }
  }

  const researchOn = (research, now = Date.now()) => !!research && research.until > now;

  const isDistracting = (host, settings) =>
    (settings?.distracting ?? []).some((d) => hostMatches(String(host).toLowerCase(), d));

  // Breaths needed before the reason. Distracting sites get one more set for each
  // open past the third in the last hour; every other site always gets the base.
  function breathsFor(base, recentOpens, distracting = true, now = Date.now()) {
    if (!distracting) return base;
    const n = (recentOpens ?? []).filter((t) => now - t < REPEAT_WINDOW).length;
    return base * (1 + Math.max(0, n - (REPEAT_FREE - 1)));
  }

  // "open" (allowlisted, has a live pass, or research mode covers it) | "gate".
  function routeUrl(url, settings, passes, research = null, now = Date.now()) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return "open";
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return "open";
    const host = u.hostname.toLowerCase();
    if ((settings?.allowlist ?? []).some((d) => hostMatches(host, d))) return "open";
    if (passLive(passFor(passes, siteOf(host), now)?.[1], now)) return "open";
    if (researchOn(research, now) && !isDistracting(host, settings)) return "open";
    return "gate";
  }

  const reasonOf = (id) => REASONS.find((r) => r.id === id) ?? REASONS[REASONS.length - 1];

  function fmt(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${String(m).padStart(2, "0")}:${sec}`;
  }

  const fmtMin = (m) => {
    m = Math.round(m);
    return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
  };

  function dayKey(t = Date.now()) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  self.WHY = {
    MIN,
    REASONS,
    MINUTES,
    RESEARCH_MINUTES,
    SEARCH_MAX_MINUTES,
    REPEAT_FREE,
    PAUSE_LIMIT,
    DEFAULT_SETTINGS,
    BREATH_IN_S,
    BREATH_OUT_S,
    BREATH_S,
    normalizeDomain,
    siteOf,
    siteOfUrl,
    activePasses,
    passLeft,
    passDueAt,
    passLive,
    passFor,
    passSites,
    routeUrl,
    researchOn,
    searchQuery,
    breathsFor,
    isDistracting,
    reasonOf,
    fmt,
    fmtMin,
    dayKey,
  };
})();
