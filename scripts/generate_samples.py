#!/usr/bin/env python3
"""Generate simple placeholder PNG assets for Open Kit Board."""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "samples"
SIZE = 64


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, rgba_pixels: list[tuple[int, int, int, int]]) -> None:
    raw = b""
    for y in range(SIZE):
        raw += b"\x00"
        for x in range(SIZE):
            r, g, b, a = rgba_pixels[y * SIZE + x]
            raw += bytes((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n"
    data += png_chunk(b"IHDR", ihdr)
    data += png_chunk(b"IDAT", zlib.compress(raw, 9))
    data += png_chunk(b"IEND", b"")
    path.write_bytes(data)


def fill(color: tuple[int, int, int, int]) -> list[tuple[int, int, int, int]]:
    return [color] * (SIZE * SIZE)


def circle(pixels: list, cx: float, cy: float, radius: float, color: tuple[int, int, int, int]) -> None:
    r2 = radius * radius
    for y in range(SIZE):
        for x in range(SIZE):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                pixels[y * SIZE + x] = color


def rect(pixels: list, x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
    for y in range(max(0, y0), min(SIZE, y1)):
        for x in range(max(0, x0), min(SIZE, x1)):
            pixels[y * SIZE + x] = color


def hex_shape(pixels: list, color: tuple[int, int, int, int], border: tuple[int, int, int, int]) -> None:
    """Draw a pointy-top hex filling most of the image."""
    cx, cy = SIZE / 2, SIZE / 2
    # pointy-top outer radius ~28
    R = 28.0
    # hex vertices
    import math
    verts = []
    for i in range(6):
        angle = math.radians(60 * i - 30)  # pointy top
        verts.append((cx + R * math.cos(angle), cy + R * math.sin(angle)))

    def point_in_hex(px, py):
        # ray casting
        inside = False
        j = 5
        for i in range(6):
            xi, yi = verts[i]
            xj, yj = verts[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
                inside = not inside
            j = i
        return inside

    for y in range(SIZE):
        for x in range(SIZE):
            if point_in_hex(x + 0.5, y + 0.5):
                # border if near edge
                edge = False
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    if not point_in_hex(x + 0.5 + dx, y + 0.5 + dy):
                        edge = True
                        break
                pixels[y * SIZE + x] = border if edge else color


ASSETS = {
    "tile-grass": ("hex", (74, 140, 60, 255), (40, 90, 30, 255)),
    "tile-stone": ("hex", (140, 140, 145, 255), (80, 80, 85, 255)),
    "tile-water": ("hex", (60, 120, 190, 255), (30, 70, 130, 255)),
    "tile-dirt": ("hex", (150, 110, 70, 255), (100, 70, 40, 255)),
    "prop-crate": ("box", (160, 110, 50, 255), (100, 70, 30, 255)),
    "prop-barrel": ("barrel", (130, 90, 50, 255), (80, 50, 25, 255)),
    "prop-tree": ("tree", (40, 120, 40, 255), (90, 60, 30, 255)),
    "prop-rock": ("rock", (120, 120, 125, 255), (70, 70, 75, 255)),
    "token-guard": ("token", (70, 110, 180, 255), (240, 220, 180, 255)),
    "token-mage": ("token", (120, 70, 180, 255), (240, 220, 180, 255)),
    "token-rogue": ("token", (50, 130, 90, 255), (240, 220, 180, 255)),
    "token-cleric": ("token", (200, 180, 60, 255), (240, 220, 180, 255)),
    "monster-goblin": ("monster", (80, 140, 50, 255), (40, 80, 25, 255)),
    "monster-orc": ("monster", (90, 110, 50, 255), (50, 60, 25, 255)),
    "monster-dragon": ("monster", (160, 50, 40, 255), (90, 25, 20, 255)),
    "monster-skeleton": ("monster", (200, 200, 190, 255), (120, 120, 110, 255)),
}


def build(kind: str, c1, c2):
    pixels = fill((0, 0, 0, 0))
    if kind == "hex":
        hex_shape(pixels, c1, c2)
    elif kind == "box":
        rect(pixels, 14, 18, 50, 52, c2)
        rect(pixels, 16, 20, 48, 50, c1)
        rect(pixels, 16, 32, 48, 36, c2)
        rect(pixels, 30, 20, 34, 50, c2)
    elif kind == "barrel":
        rect(pixels, 18, 14, 46, 52, c2)
        rect(pixels, 20, 16, 44, 50, c1)
        rect(pixels, 18, 22, 46, 26, c2)
        rect(pixels, 18, 40, 46, 44, c2)
        circle(pixels, 32, 14, 14, c2)
        circle(pixels, 32, 14, 12, c1)
    elif kind == "tree":
        rect(pixels, 28, 36, 36, 54, c2)
        circle(pixels, 32, 24, 16, c1)
        circle(pixels, 24, 30, 10, c1)
        circle(pixels, 40, 30, 10, c1)
    elif kind == "rock":
        circle(pixels, 32, 36, 18, c1)
        circle(pixels, 24, 30, 12, c2)
        circle(pixels, 40, 32, 10, c1)
    elif kind == "token":
        circle(pixels, 32, 32, 26, c1)
        circle(pixels, 32, 32, 22, (c1[0] // 2 + 40, c1[1] // 2 + 40, c1[2] // 2 + 40, 255))
        circle(pixels, 32, 28, 10, c2)  # head
        rect(pixels, 24, 38, 40, 50, c2)  # body hint
    elif kind == "monster":
        circle(pixels, 32, 34, 24, c1)
        # eyes
        circle(pixels, 24, 28, 4, (255, 255, 100, 255))
        circle(pixels, 40, 28, 4, (255, 255, 100, 255))
        circle(pixels, 24, 28, 2, (20, 20, 20, 255))
        circle(pixels, 40, 28, 2, (20, 20, 20, 255))
        # mouth
        rect(pixels, 26, 42, 38, 46, c2)
    return pixels


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (kind, c1, c2) in ASSETS.items():
        path = OUT / f"{name}.png"
        write_png(path, build(kind, c1, c2))
        print(f"wrote {path.name}")
    print(f"Done: {len(ASSETS)} assets in {OUT}")


if __name__ == "__main__":
    main()
