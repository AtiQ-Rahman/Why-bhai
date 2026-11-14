# Takes the README screenshots (docs/screenshots) with the real extension loaded and fake
# sites (YouTube, Google, Stack Overflow) served locally. Run: python3 tools/media/capture.py
# Needs: pip install playwright && playwright install chromium. Takes about 2 minutes
# (the breathing is real).
import asyncio, time, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / "extension"
OUT = ROOT / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1100, 680

FONT = "font-family: Roboto, Arial, 'Helvetica Neue', sans-serif;"

def youtube():
    vids = [("List comprehension in 10 minutes", "Python Simplified · 1.2M views", "#c4302b,#7a1d1a"),
            ("Top 10 travel spots 2026", "Wander · 3.4M views", "#3b82f6,#1e3a8a"),
            ("Funniest cats compilation", "Cat TV · 9.1M views", "#f59e0b,#92400e"),
            ("I tried 100 hot sauces", "Spicy · 2.2M views", "#ef4444,#f97316"),
            ("Learn Git in 15 minutes", "Dev Bhai · 800K views", "#10b981,#065f46"),
            ("Street food tour", "Foodie · 5M views", "#eab308,#a16207"),
            ("Gaming highlights #42", "GG · 1M views", "#8b5cf6,#4c1d95"),
            ("Morning routine vlog", "Life · 600K views", "#ec4899,#9d174d")]
    cards = "".join(f'<div class="v"><div class="t" style="background:linear-gradient(135deg,{c})"></div><b>{t}</b><span>{s}</span></div>' for t, s, c in vids)
    return f"""<!doctype html><html><head><title>YouTube</title><style>body{{margin:0;{FONT}background:#fff;color:#0f0f0f}}
    header{{display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid #eee}}
    .logo{{display:flex;align-items:center;gap:6px;font-weight:800;font-size:20px}}.logo i{{width:30px;height:21px;background:#f00;border-radius:6px;display:inline-block}}
    .s{{flex:0 1 560px;border:1px solid #ccc;border-radius:40px;padding:9px 16px;color:#333;font-size:16px}}
    .g{{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:22px 24px}}.t{{aspect-ratio:16/9;border-radius:12px;margin-bottom:8px}}
    .v b{{display:block;font-size:15px}}.v span{{font-size:13px;color:#606060}}</style></head><body>
    <header><span class="logo"><i></i>Videos</span><div class="s">python list comprehension</div></header><div class="g">{cards}</div></body></html>"""

def google(q):
    res = [("stackoverflow.com › questions", "What does “list comprehension” mean? How does it work?", "https://stackoverflow.com/questions/34835951", "A list comprehension is a syntactic construct for creating a list based on existing lists…"),
           ("docs.python.org › tutorial", "5. Data Structures — Python 3 documentation", "https://docs.python.org/3/tutorial/datastructures.html", "List comprehensions provide a concise way to create lists…"),
           ("realpython.com › list-comprehension-python", "When to Use a List Comprehension in Python", "https://realpython.com/list-comprehension-python/", "In this tutorial, you'll learn when to use a list comprehension in Python and how to create them effectively."),
           ("youtube.com › watch", "List Comprehension in Python — explained", "https://www.youtube.com/watch?v=x", "Watch this video to learn list comprehension from scratch…")]
    if "react" in q.lower():
        res = [("react.dev › reference › react › hooks", "Built-in React Hooks – React", "https://react.dev/reference/react/hooks", "Hooks let you use different React features from your components…"),
               ("react.dev › learn", "Using the State Hook – React", "https://react.dev/learn/state-a-components-memory", "useState is a React Hook that lets you add a state variable to your component."),
               ("stackoverflow.com › questions", "When to use useEffect vs useLayoutEffect?", "https://stackoverflow.com/questions/53781632", "The difference is when they run: useLayoutEffect fires synchronously after all DOM mutations…"),
               ("youtube.com › watch", "React Hooks in 20 minutes", "https://www.youtube.com/watch?v=y", "Learn useState, useEffect and custom hooks with examples…")]
    items = "".join(f'<div class="r"><div class="u">{u}</div><a href="{h}">{t}</a><p>{d}</p></div>' for u, t, h, d in res)
    return f"""<!doctype html><html><head><title>{q} - Google Search</title><style>body{{margin:0;{FONT}background:#fff;color:#202124}}
    header{{display:flex;align-items:center;gap:28px;padding:18px 28px;border-bottom:1px solid #ebebeb}}
    .logo{{font-size:26px;font-weight:600;letter-spacing:-1px}}.logo span:nth-child(1){{color:#4285f4}}.logo span:nth-child(2){{color:#ea4335}}.logo span:nth-child(3){{color:#fbbc05}}.logo span:nth-child(4){{color:#4285f4}}.logo span:nth-child(5){{color:#34a853}}.logo span:nth-child(6){{color:#ea4335}}
    .s{{flex:0 1 580px;border-radius:24px;box-shadow:0 1px 6px rgba(32,33,36,.28);padding:11px 20px;font-size:16px}}
    main{{padding:12px 0 0 180px;max-width:640px}}.n{{color:#70757a;font-size:14px;margin-bottom:18px}}
    .r{{margin-bottom:26px}}.u{{font-size:13px;color:#4d5156}}.r a{{font-size:20px;color:#1a0dab;text-decoration:none;display:block;margin:3px 0}}.r p{{margin:0;font-size:14px;color:#4d5156;line-height:1.5}}</style></head><body>
    <header><span class="logo"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></span><div class="s">{q}</div></header>
    <main><div class="n">About 9,430,000 results (0.31 seconds)</div>{items}</main></body></html>"""

def stackoverflow():
    return f"""<!doctype html><html><head><title>python - What does list comprehension mean? - Stack Overflow</title><style>body{{margin:0;{FONT}background:#fff;color:#232629}}
    header{{height:50px;border-top:3px solid #f48225;box-shadow:0 1px 2px rgba(0,0,0,.08);display:flex;align-items:center;padding:0 24px;gap:10px;font-size:18px}}
    header b{{font-weight:800}} main{{max-width:820px;margin:24px auto;padding:0 24px}} h1{{font-size:26px;font-weight:500;margin:0 0 6px}}
    .m{{color:#6a737c;font-size:13px;border-bottom:1px solid #e3e6e8;padding-bottom:12px;margin-bottom:18px}} p{{font-size:15px;line-height:1.6}}
    pre{{background:#f6f6f6;padding:12px 14px;border-radius:6px;font-size:14px}} .a{{border-top:1px solid #e3e6e8;margin-top:22px;padding-top:16px}} .tag{{background:#e1ecf4;color:#39739d;font-size:12px;padding:4px 7px;border-radius:4px;margin-right:4px}}</style></head><body>
    <header>stack <b>overflow</b></header><main><h1>What does “list comprehension” mean? How does it work?</h1>
    <div class="m">Asked 8 years ago · Viewed 230k times</div>
    <p>I have the following code and I don't understand how it works. What is this syntax called?</p><pre>[x * 2 for x in range(10) if x % 2 == 0]</pre>
    <span class="tag">python</span><span class="tag">list</span><span class="tag">list-comprehension</span>
    <div class="a"><p><b>1,024</b> &nbsp;A list comprehension builds a new list from an existing iterable in one expression. It reads like the math notation for sets:</p>
    <pre>squares = [x * x for x in nums]        # map\nevens   = [x for x in nums if x % 2 == 0]  # filter</pre></div></main></body></html>"""

async def route(r):
    url = r.request.url
    if "youtube.com" in url: body = youtube()
    elif "google.com/search" in url:
        from urllib.parse import urlparse, parse_qs
        body = google(parse_qs(urlparse(url).query).get("q", [""])[0])
    elif "stackoverflow.com" in url: body = stackoverflow()
    else: body = "<!doctype html><title>New Tab</title><body style='background:#fff'></body>"
    await r.fulfill(status=200, content_type="text/html; charset=utf-8", body=body)

DAY = 86400000

def seed_stats(now_ms):
    import datetime
    def key(ms):
        d = datetime.datetime.fromtimestamp(ms / 1000)
        return d.strftime("%Y-%m-%d")
    days = {}
    plan = [
        ({"youtube.com": 18, "google.com": 14, "github.com": 22, "stackoverflow.com": 9}, 9,
         {"youtube.com": [1, 2], "google.com": [3, 0], "github.com": [2, 0]},
         [("youtube.com", "watch the list comprehension video")], {"React hooks": 30}),
        ({"youtube.com": 42, "facebook.com": 25, "google.com": 11, "github.com": 35}, 12,
         {"youtube.com": [1, 3], "facebook.com": [0, 2], "github.com": [3, 0], "google.com": [2, 0]},
         [("facebook.com", "reply to the class group"), ("youtube.com", "one lofi song while studying")], {"flight prices": 45}),
        ({"youtube.com": 30, "github.com": 50, "google.com": 16, "chatgpt.com": 12}, 10,
         {"youtube.com": [2, 1], "github.com": [3, 0], "chatgpt.com": [2, 0]},
         [("youtube.com", "check if the new episode is out")], {"React hooks": 60}),
        ({"facebook.com": 20, "google.com": 9, "github.com": 28, "stackoverflow.com": 14}, 8,
         {"facebook.com": [1, 1], "google.com": [2, 0]}, [("facebook.com", "see the event time")], {}),
        ({"youtube.com": 24, "github.com": 40, "google.com": 12}, 9, {"youtube.com": [1, 1], "github.com": [2, 0]}, [], {"thesis sources": 45}),
        ({"instagram.com": 15, "github.com": 30, "google.com": 10}, 7, {"instagram.com": [0, 1], "github.com": [2, 0]}, [("instagram.com", "answer one DM")], {}),
        ({"youtube.com": 20, "github.com": 26, "google.com": 8}, 6, {"github.com": [2, 0], "youtube.com": [1, 0]}, [], {"flight prices": 30}),
    ]
    tot_m, tot_o, tot_r = 0, 0, 0
    for i, (sites, opens, worked, missed, topics) in enumerate(plan):
        m = sum(sites.values())
        r = sum(topics.values())
        days[key(now_ms - i * DAY)] = {"opens": opens, "skipped": opens // 3, "m": m, "sites": sites,
            "worked": {s: {"yes": y, "no": n} for s, (y, n) in worked.items()},
            "missed": [{"site": s, "note": t} for s, t in missed], "feedback": {}, "research": {"m": r, "topics": topics}}
        tot_m += m; tot_o += opens; tot_r += r
    return {"days": days, "total": {"opens": tot_o + 412, "skipped": 151, "m": tot_m + 2410, "research": tot_r + 640}}

async def main():
    async with async_playwright() as p:
        prof = tempfile.mkdtemp()
        ctx = await p.chromium.launch_persistent_context(prof, channel="chromium", headless=True,
            viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="light",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--autoplay-policy=no-user-gesture-required"])
        await ctx.route(lambda u: u.startswith("http"), route)
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        base = f"chrome-extension://{ext_id}/pages/"
        for pg in ctx.pages:  # the options page opens on install
            if "options" in pg.url: await pg.close()
        await asyncio.sleep(1)
        async def shot(page, name, full=False):
            await page.screenshot(path=str(OUT / name), full_page=full)
            print("shot", name, flush=True)

        # 1-4: YouTube: breathe, write why, pick how long, open in black & white.
        yt = await ctx.new_page()
        await yt.goto("https://www.youtube.com/")
        await yt.wait_for_selector("#breath-box:not([hidden])")
        await asyncio.sleep(13.2)  # breath 2, breathing out
        await shot(yt, "gate-breathing.png")
        await yt.wait_for_selector("#why:not([hidden])", timeout=40000)
        await yt.type("#note", "watch the list comprehension video", delay=30)
        await shot(yt, "why.png")
        await yt.click("#note-next")
        await yt.wait_for_selector("#long:not([hidden])")
        await shot(yt, "minutes.png")
        await yt.click("#mins button:nth-child(4)")  # 15 min
        await yt.wait_for_url("https://www.youtube.com/**")
        await asyncio.sleep(2.5)
        await yt.mouse.click(W - 60, H - 38)  # open the pill panel: it shows the reason
        await asyncio.sleep(0.6)
        await shot(yt, "open-gray.png")
        await yt.mouse.click(W - 60, H - 38)

        # 5-6: a search from the address bar, then a result opens on the same timer.
        g = await ctx.new_page()
        await g.goto("https://www.google.com/search?q=python+list+comprehension")
        await g.wait_for_selector("#long:not([hidden])")
        await shot(g, "search.png")
        await g.click("#mins button:nth-child(2)")  # 5 min
        await g.wait_for_url("https://www.google.com/**")
        await asyncio.sleep(1.5)
        await g.click("text=What does “list comprehension” mean?")
        await g.wait_for_url("https://stackoverflow.com/**")
        await asyncio.sleep(2)
        pill = (W - 60, H - 38)
        await g.mouse.click(*pill)
        await asyncio.sleep(0.6)
        await shot(g, "follow-link.png")
        await g.mouse.click(*pill)

        # 7: the popup, as if opened over the Google tab (its clock running), at 2x.
        p2 = await ctx.new_page()
        await p2.set_viewport_size({"width": 660, "height": 1200})
        await p2.goto(base + "popup.html")
        await asyncio.sleep(0.8)
        await p2.evaluate("""async () => {
          const { passes } = await chrome.storage.local.get('passes');
          const g = passes['google.com'];
          if (g.pausedAt) { g.until += Date.now() - g.pausedAt; delete g.pausedAt; }
          await chrome.storage.local.set({ passes });
          document.documentElement.style.zoom = 2;
        }""")
        await asyncio.sleep(1.2)
        await shot(p2, "popup.png")
        await p2.close()

        # 8: time's up on YouTube: "did you get what you came for?"
        await yt.bring_to_front()
        ctl = await ctx.new_page()
        await ctl.goto(base + "stats.html")
        await ctl.evaluate("""async () => {
          const { passes } = await chrome.storage.local.get('passes');
          passes['youtube.com'].until = Date.now() + 800; delete passes['youtube.com'].pausedAt;
          await chrome.storage.local.set({ passes });
          await new Promise(r => setTimeout(r, 1200));
          await chrome.runtime.sendMessage({ type: 'check' });
        }""")
        await yt.wait_for_selector("#ask:not([hidden])", timeout=10000)
        await shot(yt, "feedback.png")

        # 9-10: research mode (close the search pass first so its tab shows research).
        await ctl.evaluate("chrome.runtime.sendMessage({ type: 'pass:close', site: 'google.com' })")
        await asyncio.sleep(1)
        rs = await ctx.new_page()
        await rs.goto(base + "research.html")
        await rs.wait_for_selector("#topic-step:not([hidden])", timeout=45000)
        await rs.type("#topic", "React hooks", delay=30)
        await rs.click("#topic-next")
        await asyncio.sleep(0.4)
        await shot(rs, "research.png")
        await rs.click("#mins button:nth-child(2)")  # 30 min
        await rs.wait_for_url("https://www.google.com/**")
        await asyncio.sleep(2)
        await shot(rs, "research-google.png")
        await ctl.evaluate("chrome.runtime.sendMessage({ type: 'research:end' })")

        # 11: stats with a week of made-up use.
        now = int(time.time() * 1000)
        await ctl.evaluate("s => chrome.storage.local.set({ stats: s })", seed_stats(now))
        st = await ctx.new_page()
        await st.goto(base + "stats.html")
        await asyncio.sleep(1)
        await shot(st, "stats.png", full=True)

        # 12: settings.
        op = await ctx.new_page()
        await op.set_viewport_size({"width": W, "height": 700})
        await op.goto(base + "options.html")
        await asyncio.sleep(1)
        await shot(op, "settings.png")
        await ctx.close()

asyncio.run(main())
