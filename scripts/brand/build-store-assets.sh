#!/usr/bin/env bash
# Regenerates the logo, app icons, splash, favicon and Play feature graphic from assets/charbaman.png.
# Needs: python3 with pillow, fonttools, uharfbuzz; node with playwright (Chromium) for rasterising.
set -euo pipefail
cd "$(dirname "$0")/../.."
B=scripts/brand
SVG=store/logo/svg
python3 $B/build-logo.py $SVG

r() { node $B/render-svg.js "$1" "$2" "$3" "$4"; }
size() { grep -o 'width="[0-9]*" height="[0-9]*"' "$1" | head -1 | tr -dc '0-9 ' | awk '{print $1" "$2}'; }

# Logo PNGs (transparent)
r $SVG/logo-mark.svg       store/logo/logo-mark-1024.png 1024 1024
r $SVG/logo-stacked.svg    store/logo/logo-stacked.png 1800 1500
r $SVG/logo-horizontal.svg store/logo/logo-horizontal.png $(size $SVG/logo-horizontal.svg)
r $SVG/logo-wordmark.svg   store/logo/logo-wordmark.png $(size $SVG/logo-wordmark.svg)

# App icon art and Android adaptive layers (used by app.json)
T=$(mktemp -d)
r $SVG/icon.svg                $T/icon.png 1024 1024
r $SVG/adaptive-foreground.svg assets/android-icon-foreground.png 1024 1024
r $SVG/adaptive-background.svg $T/bg.png 1024 1024
r $SVG/adaptive-monochrome.svg assets/android-icon-monochrome.png 1024 1024
r $SVG/logo-mark.svg           assets/splash-icon.png 1024 1024

python3 - "$T" <<'PY'
import sys
from PIL import Image
t = sys.argv[1]
icon = Image.open(f'{t}/icon.png').convert('RGB')          # App Store: no alpha, square corners
icon.save('assets/icon.png'); icon.save('store/ios/app-icon-1024.png')
icon.resize((512, 512), Image.LANCZOS).save('store/android/play-icon-512.png')
Image.open(f'{t}/bg.png').convert('RGB').save('assets/android-icon-background.png')
Image.open('store/logo/logo-mark-1024.png').resize((48, 48), Image.LANCZOS).save('assets/favicon.png')
PY

# Play feature graphic (uses the screenshots and the files above)
node $B/render-html.js "$PWD/$B/feature-graphic.html" "$T/fg.png" 1024 500
python3 -c "from PIL import Image; Image.open('$T/fg.png').convert('RGB').save('store/android/feature-graphic.png')"
rm -rf "$T"
echo done
