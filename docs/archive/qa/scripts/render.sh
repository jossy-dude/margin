#!/usr/bin/env bash
# Offline visual harness. NO DEVICE IS AVAILABLE to any agent (see qa/STATE.md — the phone is
# behind a secure pattern). Everything visual must therefore be verified by rendering to PNG and
# LOOKING at the PNG, not by tapping.
#
#   ./qa/scripts/render.sh faces            # render all 5 clock faces x light/dark to /tmp/render
#   ./qa/scripts/render.sh face g light 400  # one face, one theme, one size
#   ./qa/scripts/render.sh svg <in.svg> <out.png> [px]
#   ./qa/scripts/render.sh html <in.html> <out.png> [w] [h]
#
# Chrome is already present; nothing to install. No network.
set -uo pipefail

CHROME=${HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
OUT=/tmp/render
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$OUT"
[ -x "$CHROME" ] || { echo "FATAL: chrome missing at $CHROME"; exit 1; }

# Render one standalone SVG file at $2 px square, centred on neutral grey so both a white and a black
# dial are visible against something.
svg_png() {
  local in="$1" out="$2" px="${3:-400}"
  local w; w="$(cat >/tmp/_wrap.html <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#8a8a8a;display:grid;place-items:center;height:100vh}
img{width:${px}px;height:${px}px;display:block}</style>
<img src="file://$(realpath "$in")">
HTML
)"
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size="$((px+30)),$((px+30))" --screenshot="$out" \
    "file:///tmp/_wrap.html" >/dev/null 2>&1
  echo "$out ($(stat -c%s "$out" 2>/dev/null || echo 0) bytes)"
}

# Render a full HTML design reference at phone-ish width.
html_png() {
  local in="$1" out="$2" w="${3:-411}" h="${4:-1200}"
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --virtual-time-budget=4000 --window-size="$w,$h" --screenshot="$out" \
    "file://$(realpath "$in")" >/dev/null 2>&1
  echo "$out ($(stat -c%s "$out" 2>/dev/null || echo 0) bytes)"
}

case "${1:-}" in
  faces)
    ( cd "$REPO" && npx jest src/test/faces.test.ts >/dev/null 2>&1 )
    for f in g rb c sl s; do
      for t in light dark; do
        [ -f "/tmp/faces/$f-$t.svg" ] && svg_png "/tmp/faces/$f-$t.svg" "$OUT/$f-$t.png" "${3:-400}"
      done
    done
    # contact sheet, all 10 at once, for side-by-side comparison
    cat > /tmp/_sheet.html <<'HTML'
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#2a2a2a;color:#eee;font:12px system-ui}
.g{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:4px}
figure{margin:0;text-align:center}img{width:100%;display:block}figcaption{padding:2px}</style>
<div class="g">
HTML
    for f in g rb c sl s; do
      for t in light dark; do
        [ -f "/tmp/faces/$f-$t.svg" ] && echo "<figure><img src=\"file:///tmp/faces/$f-$t.svg\"><figcaption>$f / $t</figcaption></figure>" >> /tmp/_sheet.html
      done
    done
    echo '</div>' >> /tmp/_sheet.html
    # 10 figures in a 5-column grid is TWO rows. The window was 460 tall, which cropped the sheet to
    # its first row: the file said "look at this first" and showed five of the ten faces.
    "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --virtual-time-budget=4000 --window-size=2100,920 --screenshot="$OUT/CONTACTSHEET.png" \
      "file:///tmp/_sheet.html" >/dev/null 2>&1
    echo "$OUT/CONTACTSHEET.png  <- LOOK AT THIS FIRST"
    ;;
  face)   svg_png "/tmp/faces/$2-$3.svg" "$OUT/$2-$3.png" "${4:-400}" ;;
  svg)    svg_png "$2" "$3" "${4:-400}" ;;
  html)   html_png "$2" "$3" "${4:-411}" "${5:-1200}" ;;
  *)      sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac