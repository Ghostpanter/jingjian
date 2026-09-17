#!/usr/bin/env python3
"""Rasterize the Jingjian mark into web icons and Android density buckets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/workspace")
PUBLIC = ROOT / "public"
ART = ROOT / "artifacts" / "brand"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
FONT_PATH = ROOT / "scripts" / "fonts" / "NotoSerifSC-700.ttf"
FONT_SEMI = ROOT / "scripts" / "fonts" / "NotoSerifSC-600.ttf"

PINE = (44, 74, 66, 255)
PAPER = (244, 239, 228, 255)
SPLASH_BG = (242, 237, 228, 255)
FOLD = (228, 216, 196, 255)
FOLD_EDGE = (205, 191, 168, 255)
INK = (44, 74, 66, 255)
SEAL = (178, 58, 47, 255)
CREAM = (244, 239, 228, 255)
WORD = (244, 239, 228, 255)


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def circle_mask(size: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
    return m


def squircle_mask(size: int) -> Image.Image:
    radius = int(size * 0.2237)
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def draw_mark(canvas: Image.Image, size: int, *, shadow: bool = True) -> None:
    """Draw the paper + seal into the center of a square canvas.

    Geometry lives in a 108-unit adaptive-icon grid so the page stays inside
    the 66dp Android safe zone.
    """
    s = size / 108.0

    def u(n: float) -> float:
        return n * s

    px, py, pw, ph = u(31.5), u(24.5), u(45), u(59)
    radius = u(2.6)
    paper_box = (px, py, px + pw, py + ph)

    if shadow:
        shade = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shade)
        offset = u(1.6)
        sd.rounded_rectangle(
            (px, py + offset, px + pw, py + ph + offset),
            radius=radius,
            fill=(20, 28, 26, 90),
        )
        blur = max(1, int(u(1.8)))
        shade = shade.filter(ImageFilter.GaussianBlur(blur))
        canvas.alpha_composite(shade)

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(paper_box, radius=radius, fill=PAPER)

    fold = u(9.2)
    d.polygon(
        [
            (px + pw - fold, py),
            (px + pw, py),
            (px + pw, py + fold),
        ],
        fill=FOLD,
    )
    d.line(
        [(px + pw - fold, py), (px + pw, py + fold)],
        fill=FOLD_EDGE,
        width=max(1, int(u(0.55))),
    )

    line_x = px + u(6.2)
    line_y = py + u(16.8)
    gap = u(7.4)
    thick = max(2, int(u(2.15)))
    widths = (u(24.5), u(18.5), u(21.5))
    alphas = (210, 120, 72)
    for i, (w, a) in enumerate(zip(widths, alphas)):
        y = line_y + i * gap
        color = (INK[0], INK[1], INK[2], a)
        d.rounded_rectangle(
            (line_x, y, line_x + w, y + thick),
            radius=thick / 2,
            fill=color,
        )

    seal = u(14.2)
    sx = px + pw - seal - u(5.2)
    sy = py + ph - seal - u(6.0)
    d.rounded_rectangle((sx, sy, sx + seal, sy + seal), radius=u(1.15), fill=SEAL)
    inset = u(1.55)
    stroke = max(1, int(u(0.7)))
    d.rounded_rectangle(
        (sx + inset, sy + inset, sx + seal - inset, sy + seal - inset),
        radius=u(0.7),
        outline=CREAM,
        width=stroke,
    )

    font_size = max(8, int(seal * 0.62))
    font = ImageFont.truetype(str(FONT_PATH), font_size)
    d.text(
        (sx + seal / 2, sy + seal / 2 - u(0.15)),
        "静",
        font=font,
        fill=CREAM,
        anchor="mm",
    )

    canvas.alpha_composite(layer)


def render_icon(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), PINE)
    draw_mark(im, size, shadow=True)
    return im


def render_foreground(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_mark(im, size, shadow=True)
    return im


def render_splash(size: int = 1280) -> Image.Image:
    im = Image.new("RGBA", (size, size), SPLASH_BG)
    mark = int(size * 0.28)
    tile = Image.new("RGBA", (mark, mark), (0, 0, 0, 0))
    draw_mark(tile, mark, shadow=False)
    word_font = ImageFont.truetype(str(FONT_SEMI), int(size * 0.048))
    d = ImageDraw.Draw(im)
    word = "静笺"
    bbox = d.textbbox((0, 0), word, font=word_font)
    word_w, word_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    gap = int(size * 0.02)
    group_h = mark + gap + word_h
    top = (size - group_h) // 2 - int(size * 0.01)
    im.alpha_composite(tile, ((size - mark) // 2, top))
    d.text(
        (size / 2, top + mark + gap + word_h / 2),
        word,
        font=word_font,
        fill=PINE,
        anchor="mm",
    )
    return im


def downscale(im: Image.Image, size: int) -> Image.Image:
    if im.size[0] == size:
        return im
    return im.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    master = render_icon(2048)
    foreground = render_foreground(2048)
    splash = render_splash(1280)

    save(downscale(master, 1024), ART / "logo-1024.png")
    save(downscale(master, 1024), PUBLIC / "logo.png")
    save(downscale(master, 512), PUBLIC / "icon-512.png")
    save(downscale(master, 192), PUBLIC / "icon-192.png")
    save(downscale(master, 180), PUBLIC / "icon-180.png")
    save(downscale(foreground, 1024), ART / "logo-fg-1024.png")
    save(splash, ART / "splash.png")

    preview = downscale(master, 1024)
    rounded = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    rounded.paste(preview, (0, 0))
    rounded.putalpha(squircle_mask(1024))
    save(rounded, ART / "logo-squircle.png")

    circ = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    circ.paste(preview, (0, 0))
    circ.putalpha(circle_mask(1024))
    save(circ, ART / "logo-circle.png")

    mipmap = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for density, (legacy, adaptive) in mipmap.items():
        folder = ANDROID_RES / f"mipmap-{density}"
        icon = downscale(master, legacy)
        save(icon, folder / "ic_launcher.png")
        round_icon = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        round_icon.paste(icon, (0, 0))
        round_icon.putalpha(circle_mask(legacy))
        save(round_icon, folder / "ic_launcher_round.png")
        save(downscale(foreground, adaptive), folder / "ic_launcher_foreground.png")

    drawable = ANDROID_RES / "drawable"
    save(downscale(foreground, 432), drawable / "splash_logo.png")
    splash_png = drawable / "splash.png"
    if splash_png.exists():
        splash_png.unlink()
    for folder in ANDROID_RES.glob("drawable-*/"):
        target = folder / "splash.png"
        if target.exists() or folder.name.startswith("drawable-port") or folder.name.startswith("drawable-land"):
            save(splash, target)

    print("icons written")


if __name__ == "__main__":
    main()
