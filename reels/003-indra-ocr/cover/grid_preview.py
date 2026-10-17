"""Profile-grid preview: each cover option as the newest post next to the real reel 2 and reel 1 covers.

Instagram's profile grid shows the centre 3:4 of a 9:16 cover (y 240-1680 of 1920). Also writes a phone-size
feed-tile check (the tile at 360 px wide, i.e. how it reads while someone scrolls the grid).

usage: python grid_preview.py out/cover_a.png out/cover_b.png ...   -> out/grid_<letter>.png + out/options_sheet.png
"""
import sys, pathlib
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
OLD = [pathlib.Path("/home/claude/reel002/out/reel02_cover_v2.jpg"), pathlib.Path("/home/claude/launch-reel/out/reel01_cover.png")]
FONT = ImageFont.load_default(size=18)
BG, GAP, TW = (0, 0, 0), 4, 360          # IG dark mode, 4 px gutters, 360 px tiles (phone width / 3 at 1080)


def tile(p, w=TW):
    im = Image.open(p).convert("RGB").resize((1080, 1920), Image.LANCZOS).crop((0, 240, 1080, 1680))
    return im.resize((w, int(w * 4 / 3)), Image.LANCZOS)


def grid(cover):
    tiles = [tile(cover)] + [tile(p) for p in OLD]
    h = tiles[0].height
    g = Image.new("RGB", (TW * 3 + GAP * 2, h), BG)
    for i, t in enumerate(tiles): g.paste(t, (i * (TW + GAP), 0))
    return g


def main(paths):
    rows = []
    for p in map(pathlib.Path, paths):
        g = grid(p); letter = p.stem.split("_")[-1]
        g.save(OUT / f"grid_{letter}.png"); rows.append((letter, p, g))
    # sheet: full 9:16 cover on the left, its grid row on the right, one option per row
    fw = 300; fh = int(fw * 16 / 9); gw = rows[0][2].width; pad = 28
    sheet = Image.new("RGB", (pad * 3 + fw + gw, pad + len(rows) * (fh + pad)), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    for i, (letter, p, g) in enumerate(rows):
        y = pad + i * (fh + pad)
        sheet.paste(Image.open(p).convert("RGB").resize((fw, fh), Image.LANCZOS), (pad, y))
        sheet.paste(g, (pad * 2 + fw, y + (fh - g.height) // 2))
        d.text((pad * 2 + fw, y + 6), f"OPTION {letter.upper()}  ->  profile grid (new post left, reel 2, reel 1)", fill=(200, 200, 205), font=FONT)
    sheet.save(OUT / "options_sheet.png")
    print("wrote", OUT / "options_sheet.png")


if __name__ == "__main__":
    main(sys.argv[1:])
