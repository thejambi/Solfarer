#!/usr/bin/env python3
"""Render preview.png (1280x640) — the social preview, in the app's own
visual language: the bubble as a golden huddle, the far beacons hanging
in the labeled void, the title set in the HUD's gold.

Reads src/stars.js (each row is a JSON array per line), so the preview
always shows the real catalog.
"""
import json, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

W, H = 1280, 640
SOLX, SOLY = 880, 330       # Sol on the right, void and title on the left
S = 0.42                    # px per ly

GOLD = (255, 215, 106)
GOLD_DIM = (160, 138, 74)
BG = (0, 3, 8)
CLASS_COL = {"O": (159, 192, 255), "B": (174, 202, 255), "A": (242, 244, 255),
             "F": (250, 241, 200), "G": (255, 221, 122), "K": (255, 170, 80),
             "M": (255, 110, 80), "D": (200, 224, 255), "?": (154, 154, 154)}


def load_rows():
    stars, beacons, target = [], [], None
    with open(os.path.join(ROOT, "src", "stars.js")) as f:
        for line in f:
            line = line.strip()
            if line.startswith("export const STARS"):
                target = stars
            elif line.startswith("export const BEACONS"):
                target = beacons
            elif line.startswith("[") and target is not None:
                target.append(json.loads(line.rstrip(",")))
    return stars, beacons


def font(size, bold=False):
    for path, idx in [("/System/Library/Fonts/Menlo.ttc", 1 if bold else 0),
                      ("/System/Library/Fonts/Supplemental/Courier New Bold.ttf"
                       if bold else
                       "/System/Library/Fonts/Supplemental/Courier New.ttf", 0)]:
        try:
            return ImageFont.truetype(path, size, index=idx)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    stars, beacons = load_rows()
    sx = lambda x: SOLX + x * S
    sy = lambda y: SOLY - y * S

    img = Image.new("RGB", (W, H), BG)

    # glow pass: soft halos, then crisp cores on top
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for row in stars + beacons:
        x, y = sx(row[1]), sy(row[2])
        if not (-20 <= x <= W + 20 and -20 <= y <= H + 20):
            continue
        c = CLASS_COL.get(row[4][:1], CLASS_COL["?"])
        r = 2.6 if row[5] <= 2 else 1.8
        gd.ellipse([x - r, y - r, x + r, y + r],
                   fill=tuple(int(v * 0.55) for v in c))
    glow = glow.filter(ImageFilter.GaussianBlur(2.2))
    from PIL import ImageChops
    img = ImageChops.add(img, glow)

    d = ImageDraw.Draw(img)

    # range rings from Sol, the outer ones labeled
    small = font(15)
    for r, lab in [(100, None), (250, "250 ly"), (500, "500 ly")]:
        pr = r * S
        d.ellipse([SOLX - pr, SOLY - pr, SOLX + pr, SOLY + pr],
                  outline=(46, 40, 22), width=1)
        if lab:
            d.text((SOLX + 5, SOLY - pr - 20), lab, font=small,
                   fill=(120, 102, 55))

    # star cores
    for row in stars:
        x, y = sx(row[1]), sy(row[2])
        if not (0 <= x <= W and 0 <= y <= H):
            continue
        c = CLASS_COL.get(row[4][:1], CLASS_COL["?"])
        r = 1.5 if row[5] <= 2 else 1.0
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)

    # beacons: core, gold ring, label — crowded labels yield
    lab_font = font(16)
    boxes = []
    for row in beacons:
        x, y = sx(row[1]), sy(row[2])
        if not (14 <= x <= W - 14 and 14 <= y <= H - 14):
            continue
        c = CLASS_COL.get(row[4][:1], CLASS_COL["?"])
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=c)
        d.ellipse([x - 5.5, y - 5.5, x + 5.5, y + 5.5],
                  outline=(140, 118, 60), width=1)
        if (x - SOLX) ** 2 + (y - SOLY) ** 2 < 80 ** 2:
            continue          # over the huddle, the name would just be noise
        w = d.textlength(row[0], font=lab_font)
        if any(abs(bx - x) < (bw + w) / 2 + 14 and abs(by - y) < 20
               for bx, by, bw in boxes):
            continue
        if x + 9 + w > W - 6:
            continue
        boxes.append((x, y, w))
        d.text((x + 9, y - 9), row[0], font=lab_font, fill=(214, 214, 214))

    # Sol, always marked
    d.ellipse([SOLX - 6, SOLY - 6, SOLX + 6, SOLY + 6], outline=GOLD, width=2)
    d.ellipse([SOLX - 2, SOLY - 2, SOLX + 2, SOLY + 2], fill=GOLD)

    # title block, lower left
    tx, ty = 56, 396
    d.text((tx, ty), "SOLFARER", font=font(64, bold=True), fill=GOLD)
    d.text((tx + 4, ty + 84), "wander the real stars", font=font(26),
           fill=GOLD_DIM)
    d.text((tx + 4, ty + 128),
           "2,236 real systems within 100 light-years · 63 far beacons",
           font=font(18), fill=(150, 150, 150))
    d.text((tx + 4, ty + 156),
           "honest 1g relativity · the universe ages faster than you",
           font=font(18), fill=(143, 233, 255))

    out = os.path.join(ROOT, "preview.png")
    img.save(out, optimize=True)
    print(f"wrote {out}: {W}x{H}, {os.path.getsize(out)//1024} KB, "
          f"{len(stars)} stars + {len(beacons)} beacons")


if __name__ == "__main__":
    main()
