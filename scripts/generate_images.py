#!/usr/bin/env python3
"""Generate the sample cover/gallery/OG images shipped with the demo content.

These are *placeholders* for real screenshots. They are intentionally generated
(no stock photos, no licensing questions) and committed as WebP with a 2x + 1x
variant so the site can ship a real srcset out of the box.

Run: python3 scripts/generate_images.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "images"
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
MONO = FONT_DIR / "DejaVuSansMono.ttf"
MONO_BOLD = FONT_DIR / "DejaVuSansMono-Bold.ttf"
SANS = FONT_DIR / "DejaVuSans.ttf"
SANS_BOLD = FONT_DIR / "DejaVuSans-Bold.ttf"

BG = (9, 12, 16)
PANEL = (15, 20, 27)
LINE = (33, 43, 54)
INK = (226, 235, 243)
MUTED = (137, 152, 166)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def glow(size: tuple[int, int], color: tuple[int, int, int], center=(0.72, 0.18), radius=0.9) -> Image.Image:
    w, h = size
    mask = Image.radial_gradient("L").resize((int(w * radius), int(h * radius)), Image.BICUBIC)
    mask = mask.filter(ImageFilter.GaussianBlur(40))
    layer = Image.new("RGB", size, BG)
    tint = Image.new("RGB", mask.size, color)
    layer.paste(tint, (int(w * center[0]) - mask.width // 2, int(h * center[1]) - mask.height // 2), mask)
    return layer


def grid(draw: ImageDraw.ImageDraw, size: tuple[int, int], step: int = 48, color=(255, 255, 255, 14)) -> None:
    w, h = size
    for x in range(0, w, step):
        draw.line([(x, 0), (x, h)], fill=color, width=1)
    for y in range(0, h, step):
        draw.line([(0, y), (w, y)], fill=color, width=1)


def noise(img: Image.Image, amount: int = 12000, alpha: int = 14) -> None:
    rnd = random.Random(7)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for _ in range(amount):
        x = rnd.randrange(img.width)
        y = rnd.randrange(img.height)
        a = rnd.randrange(alpha)
        d.point((x, y), fill=(255, 255, 255, a))
    img.alpha_composite(overlay)


def window(draw: ImageDraw.ImageDraw, box, title: str, accent, radius=18):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=radius, fill=PANEL, outline=LINE, width=2)
    draw.rounded_rectangle((x0, y0, x1, y0 + 46), radius=radius, fill=(20, 27, 36), outline=LINE, width=2)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = x0 + 24 + i * 22
        draw.ellipse((cx - 6, y0 + 17, cx + 6, y0 + 29), fill=c)
    draw.text((x0 + 92, y0 + 15), title, font=font(MONO, 19), fill=MUTED)
    draw.line([(x0 + 12, y0 + 46), (x1 - 12, y0 + 46)], fill=LINE, width=1)


def sparkline(img: Image.Image, box, color, seed=1, width=4, fill=True):
    x0, y0, x1, y1 = box
    rnd = random.Random(seed)
    points = []
    v = 0.5
    steps = 64
    for i in range(steps):
        v = max(0.08, min(0.95, v + rnd.uniform(-0.16, 0.17)))
        x = x0 + (x1 - x0) * i / (steps - 1)
        y = y1 - (y1 - y0) * v
        points.append((x, y))
    if fill:
        shade = Image.new("RGBA", (x1 - x0 + 8, y1 - y0 + 8), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shade)
        sd.polygon([(p[0] - x0 + 4, p[1] - y0 + 4) for p in points + [(x1, y1), (x0, y1)]], fill=color + (38,))
        img.alpha_composite(shade, (x0 - 4, y0 - 4))
    d = ImageDraw.Draw(img)
    d.line(points, fill=color, width=width, joint="curve")
    for p in points[::8]:
        d.ellipse((p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5), fill=color)


def pill(draw, xy, text, accent, fg=(9, 12, 16), fs=18):
    x, y = xy
    f = font(MONO_BOLD, fs)
    tw = draw.textlength(text, font=f)
    draw.rounded_rectangle((x, y, x + tw + 28, y + fs + 18), radius=(fs + 18) // 2, fill=accent)
    draw.text((x + 14, y + 8), text, font=f, fill=fg)
    return x + tw + 28


def base_canvas(size=(1600, 1000), accent=(94, 234, 212), glow_at=(0.78, 0.1)):
    img = glow(size, accent, center=glow_at).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    grid(d, size, 48)
    img.alpha_composite(overlay)
    return img


def cover_edge(tmp: Path):
    accent = (94, 234, 212)
    img = base_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    d.text((72, 74), "edge-metrics", font=font(SANS_BOLD, 54), fill=INK)
    d.text((74, 142), "global ingest · realtime rollups · p95 under 60ms", font=font(MONO, 22), fill=MUTED)

    window(d, (72, 220, 1000, 690), "edge-metrics — live", accent)
    sparkline(img, (110, 320, 960, 620), accent)
    d.text((110, 630), "last 15m · 128,402 req/s · 0 dropped", font=font(MONO, 20), fill=MUTED)

    tiles = [("p95", "42ms"), ("uptime", "99.98%"), ("regions", "17")]
    x = 1040
    for i, (k, v) in enumerate(tiles):
        y = 220 + i * 150
        d.rounded_rectangle((x, y, 1528, y + 126), radius=14, fill=PANEL, outline=LINE, width=2)
        d.text((x + 24, y + 20), k, font=font(MONO, 19), fill=MUTED)
        d.text((x + 24, y + 52), v, font=font(SANS_BOLD, 40), fill=accent if i == 0 else INK)
    d.text((72, 760), "$ curl -s https://edge.example/health | jq", font=font(MONO, 22), fill=accent)
    d.text((72, 800), '{"status":"ok","regions":17,"lag_ms":12}', font=font(MONO, 22), fill=MUTED)
    noise(img)
    return img


def cover_k8s(tmp: Path):
    accent = (167, 139, 250)
    img = base_canvas(accent=accent, glow_at=(0.2, 0.12))
    d = ImageDraw.Draw(img)
    d.text((72, 74), "k8s-rollout-operator", font=font(SANS_BOLD, 52), fill=INK)
    d.text((74, 142), "progressive delivery · automated canary analysis", font=font(MONO, 22), fill=MUTED)

    window(d, (72, 220, 880, 720), "kubectl — rollout", accent)
    lines = [
        ("$ kubectl argo rollouts get rollout api", accent),
        ("Name:      api", MUTED),
        ("Status:    ✔ Healthy", (134, 239, 172)),
        ("Strategy:  Canary", MUTED),
        ("STEP 1/5  setWeight 20   ✔", MUTED),
        ("STEP 2/5  pause          ✔", MUTED),
        ("STEP 3/5  setWeight 50   ✔", MUTED),
        ("STEP 4/5  analysis       ✔", (134, 239, 172)),
        ("STEP 5/5  setWeight 100  ✔ Healthy", (134, 239, 172)),
    ]
    for i, (line, color) in enumerate(lines):
        d.text((106, 292 + i * 44), line, font=font(MONO, 21), fill=color)

    # pod graph
    cx, cy = 1190, 430
    nodes = [(cx, cy - 150), (cx - 160, cy + 30), (cx + 160, cy + 30), (cx, cy + 170)]
    for nx, ny in nodes:
        d.line([(cx, cy), (nx, ny)], fill=(70, 60, 110), width=3)
    d.ellipse((cx - 86, cy - 52, cx + 86, cy + 52), fill=(30, 24, 48), outline=accent, width=3)
    d.text((cx - 46, cy - 14), "api:100%", font=font(MONO, 18), fill=INK)
    for nx, ny in nodes:
        d.ellipse((nx - 62, ny - 34, nx + 62, ny + 34), fill=PANEL, outline=(90, 78, 140), width=2)
        d.text((nx - 44, ny - 10), "pod ✔", font=font(MONO, 18), fill=MUTED)
    d.text((980, 700), "0 failed rollouts in 90 days", font=font(MONO, 20), fill=MUTED)
    noise(img)
    return img


def cover_ledger(tmp: Path):
    accent = (251, 191, 36)
    img = base_canvas(accent=accent, glow_at=(0.85, 0.85))
    d = ImageDraw.Draw(img)
    d.text((72, 74), "ledger-lite", font=font(SANS_BOLD, 54), fill=INK)
    d.text((74, 142), "double-entry accounting · offline-first · multi-currency", font=font(MONO, 22), fill=MUTED)

    window(d, (72, 220, 1040, 760), "ledger-lite — march", accent)
    d.text((106, 292), "ACCOUNT", font=font(MONO_BOLD, 18), fill=MUTED)
    d.text((560, 292), "DEBIT", font=font(MONO_BOLD, 18), fill=MUTED)
    d.text((760, 292), "CREDIT", font=font(MONO_BOLD, 18), fill=MUTED)
    d.text((960, 292), "BALANCE", font=font(MONO_BOLD, 18), fill=MUTED)
    rows = [
        ("Cash · EUR", "12,400.00", "", "12,400.00"),
        ("Revenue · SaaS", "", "12,400.00", "38,900.00"),
        ("VAT payable", "2,604.00", "", "2,604.00"),
        ("Cloud infra", "1,180.00", "", "-3,420.00"),
        ("Payroll", "8,700.00", "", "-8,700.00"),
    ]
    for i, row in enumerate(rows):
        y = 336 + i * 62
        d.line([(100, y + 44), (1012, y + 44)], fill=LINE, width=1)
        for j, cell in enumerate(row):
            d.text((106 + [0, 454, 654, 854][j], y + 6), cell, font=font(MONO, 20), fill=INK if j == 0 else MUTED)
    d.line([(100, 336 + len(rows) * 62 + 44), (1012, 336 + len(rows) * 62 + 44)], fill=accent, width=2)
    d.text((780, 700), "balanced ✔  0.4ms reconcile", font=font(MONO, 20), fill=(134, 239, 172))

    d.rounded_rectangle((1090, 250, 1528, 640), radius=18, fill=PANEL, outline=LINE, width=2)
    d.text((1120, 282), "CASH FLOW", font=font(MONO, 18), fill=MUTED)
    d.text((1120, 318), "+18.4%", font=font(SANS_BOLD, 54), fill=accent)
    sparkline(img, (1120, 420, 1496, 590), accent, seed=9)
    noise(img)
    return img


def gallery_canvas(size=(1400, 900), accent=(94, 234, 212)):
    return base_canvas(size=size, accent=accent, glow_at=(0.5, 0.0))


def gallery_metrics_1(path: Path):
    accent = (94, 234, 212)
    img = gallery_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    window(d, (90, 90, 1310, 810), "grafana — ingest latency", accent)
    for i, (label, value, color) in enumerate(
        [("p50", "11ms", accent), ("p95", "42ms", (134, 239, 172)), ("p99", "128ms", (251, 191, 36))]
    ):
        x = 140 + i * 380
        d.text((x, 190), label, font=font(MONO, 22), fill=MUTED)
        d.text((x, 226), value, font=font(SANS_BOLD, 52), fill=color)
        sparkline(img, (x, 330, x + 330, 560), color, seed=i + 3)
    for i in range(4):
        d.text((140, 640 + i * 38), f"region {i + 1} · healthy · 0 errors", font=font(MONO, 20), fill=MUTED)
    noise(img)
    return img


def gallery_metrics_2(path: Path):
    accent = (94, 234, 212)
    img = gallery_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    window(d, (90, 90, 1310, 810), "docs — architecture", accent)
    boxes = [(160, 220, 460, 340, "edge workers"), (520, 220, 820, 340, "ingest api"), (880, 220, 1180, 340, "rollup store")]
    for x0, y0, x1, y1, label in boxes:
        d.rounded_rectangle((x0, y0, x1, y1), radius=14, fill=(22, 32, 42), outline=accent, width=2)
        d.text((x0 + 24, y0 + 46), label, font=font(MONO, 22), fill=INK)
    for x in (460, 820):
        d.line([(x, 280), (x + 60, 280)], fill=accent, width=3)
    d.text((160, 420), "$ wrk deploy --region all --canary 5%", font=font(MONO, 22), fill=accent)
    d.text((160, 462), "→ 17 regions updated in 38s", font=font(MONO, 22), fill=MUTED)
    d.rounded_rectangle((160, 540, 1180, 740), radius=12, fill=(12, 17, 23), outline=LINE, width=2)
    for i, line in enumerate(["ingest 128k/s", "rollup lag 12ms", "errors 0.00%", "cost $0.0004/1k"]):
        d.text((190 + (i % 2) * 500, 580 + (i // 2) * 70), line, font=font(MONO, 22), fill=INK)
    noise(img)
    return img


def gallery_k8s_1(path: Path):
    accent = (167, 139, 250)
    img = gallery_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    window(d, (90, 90, 1310, 810), "argo — canary analysis", accent)
    sparkline(img, (140, 200, 1260, 500), accent, seed=21)
    d.text((140, 540), "error rate 0.02%  ·  latency +3ms  ·  analysis: passing", font=font(MONO, 22), fill=MUTED)
    for i in range(5):
        x = 140 + i * 220
        d.rounded_rectangle((x, 620, x + 190, 740), radius=12, fill=PANEL, outline=LINE, width=2)
        d.text((x + 20, 646), f"step {i + 1}", font=font(MONO, 18), fill=MUTED)
        d.text((x + 20, 682), "✔ pass" if i != 4 else "100%", font=font(MONO, 20), fill=(134, 239, 172))
    noise(img)
    return img


def gallery_k8s_2(path: Path):
    accent = (167, 139, 250)
    img = gallery_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    window(d, (90, 90, 1310, 810), "cli — dry run", accent)
    lines = [
        ("$ rollout promote api --dry-run", accent),
        ("→ resolved 42 resources", MUTED),
        ("→ diff: replicas 12 → 16", INK),
        ("→ diff: image api:1.8.2 → api:1.9.0", INK),
        ("→ guardrail: error budget 91% (ok)", (134, 239, 172)),
        ("✔ dry run clean — 0 breaking changes", (134, 239, 172)),
    ]
    for i, (line, color) in enumerate(lines):
        d.text((140, 200 + i * 54), line, font=font(MONO, 24), fill=color)
    d.rounded_rectangle((140, 570, 1260, 760), radius=12, fill=(12, 17, 23), outline=LINE, width=2)
    d.text((170, 606), "next: rollout promote api --weight 100", font=font(MONO, 20), fill=MUTED)
    noise(img)
    return img


def gallery_ledger_1(path: Path):
    accent = (251, 191, 36)
    img = gallery_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    window(d, (90, 90, 1310, 810), "ledger-lite — reconcile", accent)
    d.text((140, 200), "IMPORT", font=font(MONO_BOLD, 20), fill=MUTED)
    for i, line in enumerate(
        ["statement_2026_03.csv  ·  412 rows", "matched 409  ·  exceptions 3", "multi-currency: EUR, USD, GBP"]
    ):
        d.text((140, 250 + i * 54), line, font=font(MONO, 22), fill=INK if i == 0 else MUTED)
    sparkline(img, (140, 470, 1260, 720), accent, seed=14)
    d.text((1000, 200), "0.4ms / entry", font=font(MONO, 20), fill=(134, 239, 172))
    noise(img)
    return img


def gallery_ledger_2(path: Path):
    accent = (251, 191, 36)
    img = gallery_canvas(accent=accent)
    d = ImageDraw.Draw(img)
    window(d, (90, 90, 1310, 810), "ledger-lite — offline sync", accent)
    d.text((140, 200), "SYNC QUEUE", font=font(MONO_BOLD, 20), fill=MUTED)
    rows = [("2026-03-01 09:12", "invoice #441", "synced"), ("2026-03-01 09:15", "expense #88", "synced"),
            ("2026-03-01 09:18", "invoice #442", "queued")]
    for i, (ts, what, state) in enumerate(rows):
        y = 260 + i * 78
        d.rounded_rectangle((140, y, 1260, y + 60), radius=10, fill=PANEL, outline=LINE, width=1)
        d.text((170, y + 18), ts, font=font(MONO, 20), fill=MUTED)
        d.text((520, y + 18), what, font=font(MONO, 20), fill=INK)
        d.text((1100, y + 18), state, font=font(MONO, 20), fill=(134, 239, 172) if state == "synced" else accent)
    d.text((140, 620), "conflict-free · CRDT · works with 0 connectivity", font=font(MONO, 22), fill=MUTED)
    noise(img)
    return img


def make_og(path: Path):
    size = (1200, 630)
    img = glow(size, (94, 234, 212), center=(0.85, 0.15)).convert("RGBA")
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    grid(d, size, 40)
    img.alpha_composite(overlay)
    d = ImageDraw.Draw(img)
    d.text((72, 84), "$ whoami", font=font(MONO, 26), fill=(94, 234, 212))
    d.text((72, 140), "Your Name", font=font(SANS_BOLD, 74), fill=INK)
    d.text((72, 240), "Full-stack & DevOps Engineer", font=font(SANS, 34), fill=MUTED)
    d.text((72, 330), "I design, build and ship production systems —", font=font(SANS, 28), fill=INK)
    d.text((72, 372), "from the first schema to the last deploy.", font=font(SANS, 28), fill=INK)
    d.rounded_rectangle((72, 470, 470, 540), radius=35, fill=(94, 234, 212))
    d.text((106, 492), "Available — Q1 2027", font=font(MONO_BOLD, 20), fill=(9, 12, 16))
    d.text((72, 566), "your-username.github.io/portfolio", font=font(MONO, 22), fill=MUTED)
    noise(img, 6000, 10)
    return img


def save(img: Image.Image, path: Path, widths: list[int], quality: int = 78):
    path.parent.mkdir(parents=True, exist_ok=True)
    sources = []
    for width in widths:
        resized = img.convert("RGB").resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        suffix = "" if width == widths[-1] else f"-{width}"
        target = path.with_name(f"{path.stem}{suffix}.webp")
        resized.save(target, "WEBP", quality=quality, method=6)
        sources.append((target, width))
    return sources


def main() -> None:
    jobs = [
        ("projects/edge-metrics/cover", cover_edge, [640, 1600]),
        ("projects/k8s-rollout-operator/cover", cover_k8s, [640, 1600]),
        ("projects/ledger-lite/cover", cover_ledger, [640, 1600]),
        ("projects/edge-metrics/gallery-1", gallery_metrics_1, [700, 1400]),
        ("projects/edge-metrics/gallery-2", gallery_metrics_2, [700, 1400]),
        ("projects/k8s-rollout-operator/gallery-1", gallery_k8s_1, [700, 1400]),
        ("projects/k8s-rollout-operator/gallery-2", gallery_k8s_2, [700, 1400]),
        ("projects/ledger-lite/gallery-1", gallery_ledger_1, [700, 1400]),
        ("projects/ledger-lite/gallery-2", gallery_ledger_2, [700, 1400]),
    ]
    for rel, fn, widths in jobs:
        img = fn(OUT / rel)
        srcs = save(img, OUT / rel, widths)
        a = srcs[0][0]
        b = srcs[-1][0]
        print(f"{rel}: {a.name} + {b.name}")

    save(make_og(OUT / "og-default"), OUT / "og-default", [1200], quality=80)
    print("og-default.webp")


if __name__ == "__main__":
    main()
