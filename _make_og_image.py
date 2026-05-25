#!/usr/bin/env python3
"""Generate the 1200x630 Open Graph card (website/og-image.png) from brand tokens.

Re-run after changing the tagline. Uses Pillow + macOS system fonts; no network.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 630
BG = (11, 11, 12)
TEXT = (243, 242, 242)
MUTED = (155, 154, 161)
ACCENT = (45, 212, 191)
PAD = 84

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
MONO_CANDIDATES = ["/System/Library/Fonts/SFNSMono.ttf", BOLD]


def font(path, size):
    return ImageFont.truetype(path, size)


def first_ok(paths, size):
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit(draw, lines, path, start, min_size, max_w):
    """Largest font size (<= start) where every line fits in max_w."""
    size = start
    while size > min_size:
        f = font(path, size)
        if all(draw.textlength(t, font=f) <= max_w for t in lines):
            return f
        size -= 2
    return font(path, min_size)


def main():
    img = Image.new("RGB", (W, H), BG)

    # soft teal glow, top-right
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W - 540, -280, W + 280, 540], fill=(45, 212, 191, 48))
    glow = glow.filter(ImageFilter.GaussianBlur(130))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")

    draw = ImageDraw.Draw(img)

    # shield mark (scaled from the 28x28 SVG viewBox)
    S = 48
    ox, oy = PAD, PAD
    def sp(x, y):
        return (ox + x / 28 * S, oy + y / 28 * S)
    shield = [sp(14, 2), sp(24, 7), sp(24, 14), sp(19, 24),
              sp(14, 27), sp(9, 24), sp(4, 14), sp(4, 7)]
    draw.line(shield + [shield[0]], fill=ACCENT, width=4, joint="curve")
    draw.line([sp(10, 14), sp(13, 17), sp(18, 11)], fill=ACCENT, width=4, joint="curve")

    # wordmark
    draw.text((ox + S + 20, oy + 4), "DicomLock", font=font(BOLD, 40), fill=TEXT)

    # headline (auto-fit to the content width)
    line1, line2 = "Medical scans are files.", "Files can be weaponized."
    f_head = fit(draw, [line1, line2], BOLD, 78, 52, W - 2 * PAD)
    lh = f_head.size + 16
    hy = 252
    draw.text((PAD, hy), line1, font=f_head, fill=TEXT)
    draw.text((PAD, hy + lh), line2, font=f_head, fill=MUTED)

    # eyebrow
    draw.text((PAD, H - PAD - 24), "Open source  /  Self-hosted  /  Apache-2.0",
              font=first_ok(MONO_CANDIDATES, 26), fill=ACCENT)

    out = os.path.join(HERE, "og-image.png")
    img.save(out, "PNG")
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
