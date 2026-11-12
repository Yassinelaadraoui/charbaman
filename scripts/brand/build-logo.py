"""Build the Charbaman logo and icon SVGs.

The hero comes from assets/charbaman.png (pixel art drawn at 9x scale) and is emitted as vector
rectangles, one per pixel run, so every SVG scales without blur. The wordmark is Inter Black Italic and
the Arabic line is DejaVu Sans Bold, both shaped with HarfBuzz and converted to outlines, so the SVGs
need no fonts installed.

    pip install pillow fonttools uharfbuzz
    python3 scripts/brand/build-logo.py store/logo/svg
"""
import math, os, sys
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
ORANGE, DEEP, LIGHT, CREAM, INK, GOLD = '#FF7A00', '#E85D04', '#FFB347', '#FFF4E6', '#2B1300', '#FFD23F'

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
_big = Image.open(os.path.join(ROOT, 'assets', 'charbaman.png')).convert('RGBA')
CELL = 9  # the sprite is pixel art drawn at 9x
raw = Image.new('RGBA', (_big.width // CELL, _big.height // CELL))
for _y in range(raw.height):
    for _x in range(raw.width):
        raw.putpixel((_x, _y), _big.getpixel((_x * CELL + CELL // 2, _y * CELL + CELL // 2)))
# Sticker treatment: pad by 3 px and add a 2 px cream ring outside the hero's own black outline
PAD = 3
hero = Image.new('RGBA', (raw.width + 2 * PAD, raw.height + 2 * PAD), (0, 0, 0, 0))
hero.paste(raw, (PAD, PAD))
W, H = hero.size
_m = [[hero.getpixel((x, y))[3] > 0 for x in range(W)] for y in range(H)]
def _near(x, y, r):
    return any(0 <= x + dx < W and 0 <= y + dy < H and _m[y + dy][x + dx]
               for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r + 1)
for y in range(H):
    for x in range(W):
        if not _m[y][x] and _near(x, y, 2):
            hero.putpixel((x, y), (0xFF, 0xF4, 0xE6, 255))

def recolor(p):
    r, g, b, a = p
    if a and b > r + 20:  # chest badge blue -> Moroccan green (matches the necklace)
        return (r, int(b * 0.83), int(g * 0.9), a)
    return p

def pixels_svg(img, x0, y0, s, rows=None, mono=None):
    """Return SVG <path> elements, one per colour, merging horizontal runs."""
    w, h = img.size
    rows = rows or (0, h)
    by = {}
    for y in range(*rows):
        x = 0
        while x < w:
            p = recolor(img.getpixel((x, y)))
            if mono and sum(p[:3]) < 200:
                p = (0, 0, 0, 0)
            if p[3] == 0:
                x += 1; continue
            x1 = x
            def q(xx):
                c = recolor(img.getpixel((xx, y)))
                return (0, 0, 0, 0) if mono and sum(c[:3]) < 200 else c
            while x1 + 1 < w and q(x1 + 1) == p:
                x1 += 1
            key = mono or '#%02X%02X%02X' % p[:3]
            by.setdefault(key, []).append((x, y - rows[0], x1 - x + 1))
            x = x1 + 1
    out = []
    for col, runs in by.items():
        d = ''.join(f'M{x0+x*s:g} {y0+y*s:g}h{n*s:g}v{s:g}h{-n*s:g}z' for x, y, n in runs)
        out.append(f'<path fill="{col}" d="{d}"/>')
    return '\n'.join(out)

def text_path(fontfile, text, size, rtl=False):
    """Shape with HarfBuzz, outline with fontTools. Returns (d, width, ascender)."""
    blob = hb.Blob.from_file_path(fontfile)
    face = hb.Face(blob); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {'kern': True, 'liga': True})
    tt = TTFont(fontfile); gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
    upm = tt['head'].unitsPerEm; k = size / upm
    pen = SVGPathPen(gs)
    x = 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        g = order[info.codepoint]
        tp = TransformPen(pen, (k, 0, 0, -k, (x + pos.x_offset) * k, -pos.y_offset * k))
        gs[g].draw(tp)
        x += pos.x_advance
    return pen.getCommands(), x * k

INTER = os.environ.get('INTER_BLACK_ITALIC', '/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf')
ARAB = os.environ.get('ARABIC_BOLD', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')

def sunburst(cx, cy, r, n=16, c1=ORANGE, c2=LIGHT, op=0.45):
    rays = []
    for i in range(n):
        a0 = 2 * math.pi * i / n; a1 = a0 + math.pi / n
        rays.append(f'M{cx} {cy}L{cx+r*math.cos(a0):.1f} {cy+r*math.sin(a0):.1f}L{cx+r*math.cos(a1):.1f} {cy+r*math.sin(a1):.1f}z')
    return f'<path fill="{c2}" opacity="{op}" d="{"".join(rays)}"/>'

def bg_defs():
    return f'''<defs>
<radialGradient id="glow" cx="50%" cy="42%" r="70%">
<stop offset="0" stop-color="#FFC266"/><stop offset=".45" stop-color="{ORANGE}"/><stop offset="1" stop-color="{DEEP}"/>
</radialGradient></defs>'''

BUST_ROWS = (0, 50)  # head, arms, glass and chest

def bust(cx, top, width, mono=None, rows=None):
    s = width / W
    return pixels_svg(hero, cx - width / 2, top, s, rows or BUST_ROWS, mono)

def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">\n{body}\n</svg>\n'

def write(name, s):
    open(f'{OUT}/{name}', 'w').write(s)

# ---------- square icon art (full bleed, no transparency) ----------
def icon_body(size=1024, hero_w=960, top=None):
    top = size - hero_w / W * (BUST_ROWS[1] - BUST_ROWS[0]) + 2
    c = size / 2
    return (bg_defs() + f'<rect width="{size}" height="{size}" fill="url(#glow)"/>'
            + sunburst(c, size * .42, size, 18)
            + f'<ellipse cx="{c}" cy="{size*.43}" rx="{size*.36}" ry="{size*.36}" fill="#FFE2B8" opacity=".35"/>'
            + bust(c, top, hero_w))
write('icon.svg', svg(1024, 1024, icon_body()))

# ---------- adaptive layers (108dp canvas; keep art inside the 66dp circle) ----------
write('adaptive-foreground.svg', svg(1024, 1024, bust(512, 215, 600, rows=(0, 90))))
write('adaptive-monochrome.svg', svg(1024, 1024, bust(512, 215, 600, mono='#FFFFFF', rows=(0, 90))))
write('adaptive-background.svg', svg(1024, 1024, bg_defs() + '<rect width="1024" height="1024" fill="url(#glow)"/>' + sunburst(512, 470, 1100, 18)))

# ---------- wordmark ----------
def wordmark(x, y, size, sub=True, align='middle'):
    d, w = text_path(INTER, 'CHARBAMAN', size)
    tx = x - w / 2 if align == 'middle' else x
    sh = size * 0.07
    sw = size * 0.11
    parts = [
        f'<path transform="translate({tx+sh:.1f} {y+sh:.1f})" d="{d}" fill="{INK}" stroke="{INK}" stroke-width="{sw:.1f}" stroke-linejoin="round" opacity=".9"/>',
        f'<path transform="translate({tx:.1f} {y:.1f})" d="{d}" fill="#FFFFFF" stroke="{INK}" stroke-width="{sw:.1f}" stroke-linejoin="round" paint-order="stroke"/>',
    ]
    height = size
    if sub:
        ad, aw = text_path(ARAB, 'شربة مان', size * 0.42)
        ax = x - aw / 2 if align == 'middle' else tx + w - aw
        ay = y + size * 0.62
        parts.append(f'<path transform="translate({ax:.1f} {ay:.1f})" d="{ad}" fill="{CREAM}" stroke="{INK}" stroke-width="{size*.06:.1f}" stroke-linejoin="round" paint-order="stroke"/>')
        height = size * 1.1
    return '\n'.join(parts), w

def badge(cx, cy, r):
    clip = f'<clipPath id="bc"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
    inner = (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#glow)"/>'
             + sunburst(cx, cy - r * .1, r * 1.6, 18)
             + bust(cx, cy + r - r * 1.75 / W * (BUST_ROWS[1] - BUST_ROWS[0]) + 2, r * 1.75))
    return (bg_defs().replace('</defs>', clip + '</defs>')
            + f'<circle cx="{cx}" cy="{cy}" r="{r + r*.09}" fill="{INK}"/>'
            + f'<circle cx="{cx}" cy="{cy}" r="{r + r*.05}" fill="{CREAM}"/>'
            + f'<g clip-path="url(#bc)">{inner}</g>')

write('logo-mark.svg', svg(1024, 1024, badge(512, 512, 460)))

# stacked lockup: badge above wordmark
wm, ww = wordmark(900, 1240, 250)
write('logo-stacked.svg', svg(1800, 1500, badge(900, 520, 400) + wm))
wm_only, ww = wordmark(0, 0, 250, sub=True, align='start')
write('logo-wordmark.svg', svg(int(ww + 60), 330, f'<g transform="translate(20 225)">{wm_only}</g>'))
wm2, ww2 = wordmark(0, 0, 230, sub=True, align='start')
write('logo-horizontal.svg', svg(int(620 + ww2 + 60), 600, badge(300, 300, 255) + f'<g transform="translate(620 305)">{wm2}</g>'))
print('ok')
