#!/usr/bin/env python3
"""Generate icon.png from the same visual language as icon.svg.

Requires Pillow (bundled in the DSH runtime). Run from the repository root:
    python tools/generate-icon.py
"""

import os

from PIL import Image, ImageDraw

SIZE = 1024
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icon.png")


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def main():
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # Diagonal blue gradient.
    gradient = Image.new("RGBA", (SIZE, SIZE))
    top = (43, 93, 240)
    bottom = (23, 49, 140)
    pixels = gradient.load()
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x * 0.35 + y * 0.65) / (SIZE - 1)
            pixels[x, y] = lerp(top, bottom, t) + (255,)

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=224, fill=255)
    canvas.alpha_composite(Image.composite(gradient, Image.new("RGBA", (SIZE, SIZE)), mask))

    draw = ImageDraw.Draw(canvas)

    # Soft notification arcs behind the dot.
    for radius, width, alpha in ((150, 20, 150), (230, 18, 105)):
        draw.arc(
            (1030 - radius, 235 - radius, 1030 + radius, 235 + radius),
            start=-70,
            end=70,
            fill=(143, 180, 255, alpha),
            width=width,
        )

    # Bell: dome + skirt + base + clapper.
    draw.ellipse((352, 180, 672, 500), fill=(255, 255, 255, 255))
    draw.polygon(
        [(382, 360), (642, 360), (724, 742), (300, 742)],
        fill=(240, 246, 255, 255),
    )
    draw.rounded_rectangle((292, 706, 732, 792), radius=42, fill=(255, 255, 255, 255))
    # Shade the lower part of the bell slightly for depth.
    shade = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade)
    shade_draw.polygon([(300, 640), (724, 640), (724, 742), (300, 742)], fill=(90, 130, 220, 70))
    shade_draw.rectangle((382, 640, 642, 742), fill=(90, 130, 220, 0))
    canvas.alpha_composite(shade)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((292, 706, 732, 792), radius=42, fill=(255, 255, 255, 255))
    draw.ellipse((464, 782, 560, 878), fill=(255, 255, 255, 255))

    # Amber badge.
    draw.ellipse((770, 150, 930, 310), fill=(255, 176, 32, 255))
    draw.ellipse((805, 185, 895, 275), fill=(255, 214, 120, 255))

    icon = canvas.resize((256, 256), Image.LANCZOS)
    icon.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KiB)")


if __name__ == "__main__":
    main()
