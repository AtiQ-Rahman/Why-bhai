# Builds docs/why-bhai-demo.mp4 (1280x720, voiceover) and docs/demo.gif from docs/screenshots.
# Run capture.py first, then: python3 tools/media/video.py
# Needs: playwright, edge-tts (pip install edge-tts; it calls Microsoft's online voices), Pillow, ffmpeg.
import asyncio, base64, subprocess
from pathlib import Path
from playwright.async_api import async_playwright
import edge_tts

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs" / "screenshots"
WORK = Path(__file__).parent / "build"  # slides and voice clips (git-ignored)
WORK.mkdir(exist_ok=True)
ICON = ROOT / "extension" / "icons" / "icon128.png"
VOICE = "en-US-AndrewNeural"
REPO = "github.com/AtiQ-Rahman/Why-bhai"

# (title, subtitle, screenshot, voiceover)
SLIDES = [
    ("", "", "TITLE", "Why Bhai? Mindful browsing, one site at a time."),
    ("1. Every site starts closed", "Open any website, and it asks you to breathe first.", "gate-breathing.png",
     "Every website starts closed. Open one, and it asks you to breathe first. In for four, out for six."),
    ("2. Why do you want it?", "Write it in your own words. Not for anything real? Close it.", "why.png",
     "Then, why do you want it? Write it in your own words, no buttons to tap without thinking. And if it's not for anything real, just close it."),
    ("3. For how long?", "2 to 30 minutes, or type your own.", "minutes.png",
     "Pick how long. Two to thirty minutes, or type your own."),
    ("4. It opens in black & white", "A ticking clock, and your reason in the corner.", "open-gray.png",
     "The site opens in black and white, with a ticking clock and your reason in the corner."),
    ("5. Searching is quick", "Search from the address bar: no breathing, just pick how long.", "search.png",
     "Searching is quick. Search from the address bar, and you skip the breathing. Just pick how long."),
    ("6. Links just open", "Click a result: it opens on the same timer.", "follow-link.png",
     "Click a result, and it just opens, on the same timer. Typing a new address still asks why."),
    ("7. All in the popup", "Open sites and their timers. Click one to go to its tab.", "popup.png",
     "The popup shows what's open and how long is left. Click a site to jump to its tab."),
    ("8. Did it work?", "When time is up, it asks if you got what you came for.", "feedback.png",
     "When time is up, it closes, and asks: did you get what you came for?"),
    ("9. Research mode", "Breathe, name the topic, pick 15 to 60 minutes.", "research.png",
     "Need to dig into something? Research mode. Breathe once, name the topic, and pick fifteen to sixty minutes."),
    ("10. Every link opens while you research", "YouTube, Facebook and Instagram still ask why.", "research-google.png",
     "Every link opens while you research. YouTube, Facebook and Instagram still ask why."),
    ("11. See where the time went", "Minutes per site, what worked, and what you didn't get.", "stats.png",
     "Stats show where the time went, which sites gave you what you came for, and which didn't."),
    ("12. Settings", "Always-open sites, distracting sites, breaths, sound.", "settings.png",
     "Settings: always-open sites, distracting sites, breaths and sound."),
    ("", "", "END", "Close the tab, and the site closes too. Why Bhai is free and open source. The link is below."),
]

CSS = """
*{box-sizing:border-box;margin:0}
body{width:1280px;height:720px;background:#faf7f2;font-family:'DejaVu Sans',system-ui,sans-serif;color:#1c1917;overflow:hidden;position:relative}
.bar{position:absolute;top:0;left:0;right:0;height:6px;background:#6d28d9}
h1{position:absolute;left:44px;top:34px;font-size:34px;font-weight:800;letter-spacing:-.3px}
p{position:absolute;left:46px;top:84px;font-size:18px;color:#78716c}
.shot{position:absolute;left:50%;top:128px;transform:translateX(-50%);border-radius:14px;box-shadow:0 12px 40px rgba(28,25,23,.18),0 0 0 1px rgba(28,25,23,.08);overflow:hidden;background:#fff}
.shot img{display:block}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.center img{width:150px;height:150px}
.center h2{font-size:64px;font-weight:800;letter-spacing:-1px}
.center span{font-size:24px;color:#78716c}
"""

def b64(p):
    return "data:image/png;base64," + base64.b64encode(Path(p).read_bytes()).decode()

def slide_html(title, sub, img):
    if img in ("TITLE", "END"):
        line = "Mindful browsing, one site at a time." if img == "TITLE" else REPO
        body = f'<div class="center"><img src="{b64(ICON)}"><h2>Why Bhai?</h2><span>{line}</span></div>'
    else:
        from PIL import Image
        w, h = Image.open(SHOTS / img).size
        maxw, maxh = 1180, 560
        s = min(maxw / w, maxh / h)
        body = f'<div class="bar"></div><h1>{title}</h1><p>{sub}</p><div class="shot"><img src="{b64(SHOTS / img)}" style="width:{int(w*s)}px;height:{int(h*s)}px"></div>'
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode())

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1280, "height": 720})
        for i, (t, s, img, vo) in enumerate(SLIDES):
            await pg.set_content(slide_html(t, s, img))
            await pg.wait_for_timeout(150)
            await pg.screenshot(path=str(WORK / f"s{i:02d}.png"))
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(vo, VOICE, rate="-4%").save(str(WORK / f"v{i:02d}.mp3"))
                    break
                except Exception as e:
                    print("tts retry", i, e, flush=True)
                    await asyncio.sleep(2 + attempt * 2)
            else:
                raise SystemExit(f"no voice for slide {i}")
            print("slide", i, flush=True)
        await b.close()

    FADE = 0.5
    PAD = 0.9  # quiet after each line
    parts, lens = [], []
    for i in range(len(SLIDES)):
        d = dur(WORK / f"v{i:02d}.mp3") + PAD + (FADE if i else 0.4)
        lens.append(d)
        # each slide: still image for d seconds + its voice (delayed a little), as one clip
        clip = WORK / f"c{i:02d}.mp4"
        delay = int((0.25 if i else 0.4) * 1000)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", f"{d:.3f}", "-i", str(WORK / f"s{i:02d}.png"),
                        "-i", str(WORK / f"v{i:02d}.mp3"),
                        "-filter_complex", f"[1:a]adelay={delay}|{delay},apad,atrim=0:{d:.3f},aresample=24000,aformat=channel_layouts=mono[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "96k",
                        "-t", f"{d:.3f}", str(clip)], check=True)
        parts.append(clip)
    # crossfade the clips
    inputs, vf, af = [], [], []
    for c in parts:
        inputs += ["-i", str(c)]
    off = 0.0
    vlast, alast = "[0:v]", "[0:a]"
    for i in range(1, len(parts)):
        off += lens[i - 1] - FADE
        vf.append(f"{vlast}[{i}:v]xfade=transition=fade:duration={FADE}:offset={off:.3f}[v{i}]")
        af.append(f"{alast}[{i}:a]acrossfade=d={FADE}[a{i}]")
        vlast, alast = f"[v{i}]", f"[a{i}]"
    out = ROOT / "docs" / "why-bhai-demo.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af), "-map", vlast, "-map", alast,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "slow", "-r", "30",
                    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(out)], check=True)
    gif = ROOT / "docs" / "demo.gif"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out), "-vf",
                    "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
                    str(gif)], check=True)
    print("done", dur(out))

asyncio.run(main())
