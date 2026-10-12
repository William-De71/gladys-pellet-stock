#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Generated illustrations of the widgets, in the four languages:
#   docs/assets/widget-stock.<lang>.png  the two views of "Pellet stock"
#   docs/assets/widget-silo.<lang>.png   "Pallet delivered" form + "Pellet silo"
#   docs/assets/widget-prices.<lang>.png "Pellet prices"
#
# They are NOT screenshots of a running Gladys: the contents come from the
# integration's own code (gen.mjs, on a made-up winter), and render.js draws
# them the way the Gladys front does (same structure and class names as
# front/src/components/boxs/external-widget, the official theme, the same
# ApexCharts options, the dark mode of Gladys).
#
# Needs: Node, Chrome or Chromium (CHROME=/path/to/chrome, or the Playwright
# one), ImageMagick and Python 3 with Pillow. Run from the repository root:
#   docs/illustrations/render.sh
# -----------------------------------------------------------------------------
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
here="$repo/docs/illustrations"
out="$repo/docs/assets"
# The Gladys front the styles are taken from (master on 2026-10-13).
gladys_ref="7d3129909dde677070db5614dcf1132c9fde001d"
gladys_raw="https://raw.githubusercontent.com/GladysAssistant/Gladys/${gladys_ref}/front/src"

chrome="${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | tail -n1)}"
if [ ! -x "$chrome" ]; then
  echo "Chrome not found: set CHROME=/path/to/chrome" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$here/index.html" "$here/render.js" "$work/"

# The official theme and ApexCharts, as the Gladys front bundles them.
mkdir -p "$work/vendor/theme" "$work/vendor/apexcharts"
(cd "$work/vendor" && npm pack -s @gladysassistant/theme-optimized@2.1.0 apexcharts@3.54.1 >/dev/null)
tar xzf "$work"/vendor/gladysassistant-theme-optimized-*.tgz -C "$work/vendor/theme"
tar xzf "$work"/vendor/apexcharts-*.tgz -C "$work/vendor/apexcharts"

# The widget styles are a CSS module: its class names are used as they are.
curl -fsS "$gladys_raw/components/boxs/external-widget/style.css" |
  sed -E 's/:global\(([^)]*)\)/\1/g' >"$work/widget.css"
curl -fsS "$gladys_raw/style/dark-mode.css" -o "$work/dark-mode.css"

node "$here/gen.mjs" "$repo" "$work/contents.json"
locales="$work/vendor/apexcharts/package/dist/locales"
{
  printf 'window.APEX_LOCALES=['
  for language in fr en de es; do cat "$locales/$language.json"; printf ','; done
  printf '];\nwindow.DATA='
  cat "$work/contents.json"
  printf ';\n'
} >"$work/data.js"

shot() {
  local file="$1" size="$2" query="$3"
  "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --allow-file-access-from-files --virtual-time-budget=4000 \
    --window-size="$size" --force-device-scale-factor=1.5 \
    --screenshot="$file" "file://$work/index.html?$query" >/dev/null 2>&1
  local background
  background="$(magick "$file" -format '%[pixel:p{2,2}]' info:)"
  magick "$file" -trim -bordercolor "$background" -border 30 "$file"
}

for language in en fr de es; do
  shot "$out/widget-stock.$language.png" 880,1400 \
    "lang=$language&cards=stock,consumption&theme=dark"
  shot "$out/widget-silo.$language.png" 880,1800 \
    "lang=$language&cards=stock,silo&form=stock:delivery&theme=dark"
  shot "$out/widget-prices.$language.png" 460,1000 "lang=$language&cards=prices&theme=dark"
done

# 128 colors are plenty for a flat interface: about 50 to 80 KB per image.
python3 -I - "$out" <<'PY'
import glob
import sys
from PIL import Image

for path in glob.glob(f"{sys.argv[1]}/widget-*.png"):
    image = Image.open(path).convert("RGB")
    image.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(
        path, optimize=True
    )
PY
ls -l "$out"/widget-*.png
