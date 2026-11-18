#!/usr/bin/env python3
"""Build all app icons from the VWELDCORE logo (largest candidate wins)."""
import glob, os
from PIL import Image

os.makedirs('icons', exist_ok=True)
cands = []
for p in ['brand-logo.jpg'] + glob.glob('try-*'):
    try:
        im = Image.open(p).convert('RGB')
        cands.append((im.size[0] * im.size[1], p, im))
    except Exception:
        pass
if not cands:
    raise SystemExit('No logo found: brand-logo.jpg missing')
cands.sort(key=lambda c: c[0], reverse=True)
_, name, logo = cands[0]
w, h = logo.size
pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]
px = [logo.getpixel(p) for p in pts]
bg = tuple(sum(c[i] for c in px) // 4 for i in range(3))   # logo background colour
side = max(w, h)
sq = Image.new('RGB', (side, side), bg)
sq.paste(logo, ((side - w) // 2, (side - h) // 2))

def out(fn, size, pad=0.0):
    inner = int(size * (1 - 2 * pad))
    canvas = Image.new('RGB', (size, size), bg)
    canvas.paste(sq.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, (size - inner) // 2))
    canvas.save('icons/' + fn, optimize=True)
    print('made', fn)

out('icon-192.png', 192)
out('icon-512.png', 512)
out('icon-maskable-512.png', 512, 0.12)   # keeps art inside Android's safe zone
out('apple-touch-icon.png', 180, 0.06)
out('favicon-32.png', 32)
print('source:', name, (w, h), 'bg', bg)
