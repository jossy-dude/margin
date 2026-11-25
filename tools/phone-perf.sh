#!/usr/bin/env bash
# v0.7.7 (SPEC §0, §2, §6): numbers and recordings from the real phone over (wireless) adb.
#
#   tools/phone-perf.sh launch  [label]   cold start x5: `am start -W` TotalTime + the app's [margin-boot] marks
#   tools/phone-perf.sh record  [label]   screenrecord one cold start at 20 Mbit/s, then split it into 60 fps frames
#   tools/phone-perf.sh tour    [label]   janky frames on a scripted tab tour (dumpsys gfxinfo framestats)
#   tools/phone-perf.sh mem     [label]   memory after the tour (dumpsys meminfo, TOTAL PSS)
#   tools/phone-perf.sh all     [label]   launch + tour + mem
#
# Results land in output/perf/<label>-<time>/. PKG defaults to app.marrow; set PKG=app.marrow.dev for a dev build.
# Tab taps use NAV_Y (px from the top of the screen, default: 94 % of the height) and five evenly spaced columns.
set -euo pipefail

PKG="${PKG:-app.marrow}"
ACT="$PKG/app.marginalia.planner.MainActivity"
cmd="${1:-all}"; label="${2:-run}"
out="output/perf/${label}-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$out"

adb get-state >/dev/null 2>&1 || { echo "No phone on adb. Turn on wireless debugging and: adb connect <ip>:<port>" >&2; exit 1; }

size=$(adb shell wm size | awk -F': ' '/Physical/{print $2}' | tr -d '\r'); W=${size%x*}; H=${size#*x}
NAV_Y="${NAV_Y:-$((H * 94 / 100))}"

cold() { adb shell am force-stop "$PKG"; sleep 1; adb logcat -c; adb shell am start -W -n "$ACT" | tr -d '\r'; }

launch() {
  echo "run,total_ms,boot_marks" > "$out/launch.csv"
  for i in 1 2 3 4 5; do
    total=$(cold | awk -F': ' '/TotalTime/{print $2}')
    sleep 4
    marks=$(adb logcat -d -s ReactNativeJS | grep -o '\[margin-boot\].*' | tail -1 | tr -d '\r' || true)
    echo "$i,$total,\"$marks\"" | tee -a "$out/launch.csv"
  done
}

record() {
  adb shell am force-stop "$PKG"; sleep 1
  adb shell screenrecord --bit-rate 20000000 --time-limit 6 /sdcard/marrow-launch.mp4 &
  rec=$!; sleep 0.5
  adb shell am start -n "$ACT" >/dev/null
  wait $rec || true
  adb pull /sdcard/marrow-launch.mp4 "$out/launch.mp4" >/dev/null
  adb shell rm /sdcard/marrow-launch.mp4
  mkdir -p "$out/frames"
  ffmpeg -loglevel error -i "$out/launch.mp4" -vf fps=60,scale=270:-1 "$out/frames/%04d.png"
  echo "frames: $out/frames ($(ls "$out/frames" | wc -l))"
}

tap_tab() { adb shell input tap $(( W * (2 * $1 + 1) / 10 )) "$NAV_Y"; sleep 0.8; }

tour() {
  adb shell dumpsys gfxinfo "$PKG" reset >/dev/null
  for round in 1 2 3; do for t in 0 1 2 3 4; do tap_tab "$t"; done; done
  adb shell dumpsys gfxinfo "$PKG" framestats > "$out/gfxinfo.txt"
  grep -E "Total frames rendered|Janky frames|90th percentile|95th percentile|99th percentile" "$out/gfxinfo.txt" | head -6 | tee "$out/tour.txt"
}

mem() { adb shell dumpsys meminfo "$PKG" > "$out/meminfo.txt"; grep -E "TOTAL PSS|TOTAL:" "$out/meminfo.txt" | head -2 | tee "$out/mem.txt"; }

case "$cmd" in
  launch) launch ;;
  record) record ;;
  tour) tour ;;
  mem) mem ;;
  all) launch; tour; mem ;;
  *) echo "usage: $0 launch|record|tour|mem|all [label]" >&2; exit 2 ;;
esac
echo "→ $out"
