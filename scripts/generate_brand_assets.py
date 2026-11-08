#!/usr/bin/env python3
"""Generate the brand + fallback assets that ship in /public.

Everything here is generated, so the repo carries no third-party artwork:

  public/favicon.svg
  public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
  public/images/projects/placeholder/cover.webp (+ 640w variant)
  public/cv.pdf                      (placeholder CV — replace with your own)

Run: python3 scripts/generate_brand_assets.py
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
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
ACCENT = (94, 234, 212)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


# --------------------------------------------------------------------------- icon


def icon_canvas(size: int = 512, rounded: bool = True) -> Image.Image:
    """Dark square with an accent terminal prompt. Drawn at 4x, downsampled.

    `rounded=False` produces a full-bleed maskable icon; the glyph already sits
    inside the 80% safe zone, so the launcher mask cannot clip it.
    """
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(s * 0.22)
    if rounded:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=(*BG, 255))
    else:
        d.rectangle((0, 0, s - 1, s - 1), fill=(*BG, 255))

    # subtle top-left accent glow
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        (int(s * 0.05), int(s * -0.25), int(s * 0.95), int(s * 0.65)),
        fill=(*ACCENT, 30),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(int(s * 0.08)))
    img.alpha_composite(Image.composite(glow, Image.new("RGBA", (s, s), (0, 0, 0, 0)), img.split()[3]))

    stroke = max(2, int(s * 0.055))
    # chevron  >
    d.line(
        [(int(s * 0.3), int(s * 0.34)), (int(s * 0.47), int(s * 0.5)), (int(s * 0.3), int(s * 0.66))],
        fill=(*ACCENT, 255),
        width=stroke,
        joint="curve",
    )
    # underscore  _
    d.line(
        [(int(s * 0.55), int(s * 0.66)), (int(s * 0.72), int(s * 0.66))],
        fill=(*INK, 255),
        width=stroke,
    )

    return img.resize((size, size), Image.LANCZOS)


def write_favicon(path: Path) -> None:
    path.write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Terminal prompt">
  <rect width="32" height="32" rx="7" fill="#090c10"/>
  <path d="M9 10.5 15.5 16 9 21.5" fill="none" stroke="#5eead4" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 21.5h6" fill="none" stroke="#e2ebf3" stroke-width="2.6" stroke-linecap="round"/>
</svg>
""",
        encoding="utf-8",
    )


# ----------------------------------------------------------------- placeholder


def noise(img: Image.Image, amount: int = 9000, alpha: int = 12) -> None:
    rnd = random.Random(11)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for _ in range(amount):
        d.point(
            (rnd.randrange(img.width), rnd.randrange(img.height)),
            fill=(255, 255, 255, rnd.randrange(alpha)),
        )
    img.alpha_composite(overlay)


def placeholder_cover(size=(1600, 1000)) -> Image.Image:
    w, h = size
    img = Image.new("RGBA", size, (*BG, 255))
    d = ImageDraw.Draw(img)

    for x in range(0, w, 50):
        d.line([(x, 0), (x, h)], fill=(255, 255, 255, 10), width=1)
    for y in range(0, h, 50):
        d.line([(0, y), (w, y)], fill=(255, 255, 255, 10), width=1)

    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((int(w * 0.55), int(h * -0.35), int(w * 1.2), int(h * 0.7)), fill=(*ACCENT, 34))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)))

    # dashed frame
    margin = 64
    d.rounded_rectangle(
        (margin, margin, w - margin, h - margin),
        radius=28,
        outline=(*ACCENT, 110),
        width=3,
    )

    cx, cy = w // 2, h // 2
    d.line([(cx - 70, cy - 150), (cx, cy - 70), (cx - 70, cy + 10)], fill=(*ACCENT, 255), width=12, joint="curve")
    d.line([(cx + 24, cy + 10), (cx + 110, cy + 10)], fill=(*INK, 255), width=12)

    center = ImageDraw.Draw(img)
    center.text((cx, cy + 120), "REPLACE THIS COVER", font=font(MONO_BOLD, 44), fill=INK, anchor="mm")
    center.text(
        (cx, cy + 180),
        "1200–1600 px wide · WebP · 16:10 or 16:9",
        font=font(MONO, 22),
        fill=MUTED,
        anchor="mm",
    )
    center.text((cx, cy + 226), "admin → Projects → Media", font=font(MONO, 22), fill=(*ACCENT, 220), anchor="mm")

    noise(img)
    return img


def save_webp(img: Image.Image, path: Path, widths: list[int], quality: int = 80) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    base = path.with_suffix("").name
    for width in widths:
        height = round(img.height * width / img.width)
        resized = img.resize((width, height), Image.LANCZOS).convert("RGB")
        target = path.parent / (f"{base}.webp" if width == max(widths) else f"{base}-{width}.webp")
        resized.save(target, "WEBP", quality=quality, method=6)
        print(f"  {target.relative_to(ROOT)}  {width}x{height}")


# --------------------------------------------------------------------- cv.pdf


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=fnt) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def write_cv(path: Path) -> None:
    dpi = 150
    width, height = int(8.27 * dpi), int(11.69 * dpi)  # A4
    img = Image.new("RGB", (width, height), (12, 15, 20))
    d = ImageDraw.Draw(img)
    margin = int(dpi * 0.75)
    right = width - margin
    content_width = right - margin

    d.rectangle((0, 0, width, int(dpi * 0.16)), fill=ACCENT)

    y = margin
    d.text((margin, y), "YOUR NAME", font=font(SANS_BOLD, 52), fill=INK)
    y += 64
    d.text((margin, y), "Full-stack & DevOps Engineer", font=font(SANS, 26), fill=ACCENT)
    y += 42
    d.text(
        (margin, y),
        "you@example.com  ·  github.com/your-username  ·  Remote, UTC+1",
        font=font(SANS, 15),
        fill=MUTED,
    )
    y += 42
    d.line([(margin, y), (right, y)], fill=LINE, width=2)
    y += 40

    def section(title: str) -> None:
        nonlocal y
        d.text((margin, y), title.upper(), font=font(MONO_BOLD, 17), fill=ACCENT)
        y += 12
        d.line([(margin, y), (right, y)], fill=LINE, width=1)
        y += 22

    def paragraph(text: str, fnt=None, fill=INK) -> None:
        nonlocal y
        fnt = fnt or font(SANS, 16)
        for line in wrap(d, text, fnt, content_width):
            d.text((margin, y), line, font=fnt, fill=fill)
            y += 24
        y += 10

    section("Profile")
    paragraph(
        "Freelance software engineer working where product meets infrastructure. Eight years of building "
        "production systems in TypeScript, Go and Kubernetes — from the first schema to the last deploy. "
        "Usually one engagement at a time, three to six months long."
    )
    y += 8

    section("Selected experience")
    roles = [
        (
            "Freelance Software Engineer & Consultant",
            "Independent · 2023 — Present",
            "Product engineering, platform work and reliability audits for teams between seed stage and series B. "
            "Shipped 11 client projects; 9 still run without me.",
        ),
        (
            "Senior Platform Engineer",
            "Northwind Systems · 2020 — 2023",
            "Owned the deployment platform for 40 engineers. Migrated 60 services to EKS with no customer-visible "
            "downtime; cut mean deploy time from 24 minutes to 4.",
        ),
        (
            "Full-stack Developer",
            "Bitfold · 2017 — 2020",
            "Second engineer on a B2B analytics product. Scaled event ingest from 200 to 40k events/s and "
            "introduced the first real CI pipeline.",
        ),
    ]
    for role, meta, body in roles:
        d.text((margin, y), role, font=font(SANS_BOLD, 19), fill=INK)
        y += 26
        d.text((margin, y), meta, font=font(MONO, 14), fill=MUTED)
        y += 26
        paragraph(body, font(SANS, 15))
        y += 6

    section("Skills")
    for group, items in [
        ("Languages", "TypeScript, Go, Python, SQL, Bash"),
        ("Platform", "Kubernetes, Docker, Terraform, GitHub Actions, Argo CD"),
        ("Cloud", "AWS, Cloudflare, Fly.io, PostgreSQL, Redis, ClickHouse"),
        ("Practice", "Observability, SLOs, WCAG 2.2, performance audits"),
    ]:
        d.text((margin, y), group, font=font(SANS_BOLD, 15), fill=INK)
        d.text((margin + 126, y), items, font=font(SANS, 15), fill=MUTED)
        y += 26

    y += 16
    d.line([(margin, y), (right, y)], fill=LINE, width=1)
    y += 18
    d.text(
        (margin, y),
        "Placeholder CV — replace public/cv.pdf with your real one.",
        font=font(MONO, 13),
        fill=(*ACCENT, 255),
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PDF", resolution=dpi)
    print(f"  {path.relative_to(ROOT)}  A4 @ {dpi} dpi")


# ------------------------------------------------------------------------ main


def main() -> None:
    print("brand assets")
    write_favicon(PUBLIC / "favicon.svg")
    print(f"  {(PUBLIC / 'favicon.svg').relative_to(ROOT)}")

    base = icon_canvas(512)
    base.save(PUBLIC / "icon-512.png", "PNG", optimize=True)
    print(f"  {(PUBLIC / 'icon-512.png').relative_to(ROOT)}  512x512")
    base.resize((192, 192), Image.LANCZOS).save(PUBLIC / "icon-192.png", "PNG", optimize=True)
    print(f"  {(PUBLIC / 'icon-192.png').relative_to(ROOT)}  192x192")
    base.resize((180, 180), Image.LANCZOS).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    print(f"  {(PUBLIC / 'apple-touch-icon.png').relative_to(ROOT)}  180x180")
    icon_canvas(512, rounded=False).save(PUBLIC / "icon-maskable-512.png", "PNG", optimize=True)
    print(f"  {(PUBLIC / 'icon-maskable-512.png').relative_to(ROOT)}  512x512 maskable")

    print("placeholder cover")
    save_webp(placeholder_cover(), PUBLIC / "images" / "projects" / "placeholder" / "cover.webp", [640, 1600])

    print("cv")
    write_cv(PUBLIC / "cv.pdf")
    print("done")


if __name__ == "__main__":
    main()
