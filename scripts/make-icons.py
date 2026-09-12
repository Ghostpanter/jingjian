#!/usr/bin/env python3
"""Rasterize Jingjian logo into web and Android density buckets."""

from pathlib import Path

from PIL import Image

SRC = Path(
    "/workspace/artifacts/imagine_images/7131c424-d641-4a34-9b74-e72e964ef641.jpg"
)
PUBLIC = Path("/workspace/public")
ART = Path("/workspace/artifacts/brand")
ANDROID_RES = Path("/workspace/android/app/src/main/res")

INK = (44, 74, 66, 255)


def cover_square(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def main() -> None:
    src = Image.open(SRC)
    ART.mkdir(parents=True, exist_ok=True)

    icon_1024 = cover_square(src, 1024)
    save(icon_1024, ART / "logo-1024.png")
    save(icon_1024, PUBLIC / "logo.png")
    save(cover_square(src, 512), PUBLIC / "icon-512.png")
    save(cover_square(src, 192), PUBLIC / "icon-192.png")
    save(cover_square(src, 180), PUBLIC / "icon-180.png")

    splash = Image.new("RGBA", (1280, 1280), INK)
    mark = cover_square(src, 560)
    splash.paste(mark, ((1280 - 560) // 2, (1280 - 560) // 2), mark)
    save(splash, ART / "splash.png")

    mipmap = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }
    for density, (legacy, adaptive) in mipmap.items():
        folder = ANDROID_RES / f"mipmap-{density}"
        save(cover_square(src, legacy), folder / "ic_launcher.png")
        save(cover_square(src, legacy), folder / "ic_launcher_round.png")
        save(cover_square(src, adaptive), folder / "ic_launcher_foreground.png")

    drawable = ANDROID_RES / "drawable"
    save(cover_square(src, 432), drawable / "splash_logo.png")
    save(splash, drawable / "splash.png")

    print("icons written")


if __name__ == "__main__":
    main()
