#!/usr/bin/env bash
# adb helper for Marginalia device QA. Every QA agent drives the device
# through this script so behaviour stays identical between agents.
#
#   ./qa/scripts/adb.sh shot today_01            screenshot -> qa/shots/today_01.png
#   ./qa/scripts/adb.sh dump                    list interactive elements as TSV
#   ./qa/scripts/adb.sh texts                   all visible text, one item per line
#   ./qa/scripts/adb.sh tap "Tasks"             tap by exact text/content-desc
#   ./qa/scripts/adb.sh tap --like "in 10 min"  tap by substring match
#   ./qa/scripts/adb.sh tap --idx 3 "Delete"    tap the Nth match (0-based)
#   ./qa/scripts/adb.sh tapx 540 1200           tap raw coordinates
#   ./qa/scripts/adb.sh type "QA_Physics"       type into the focused field
#   ./qa/scripts/adb.sh key BACK|ENTER|HOME     hardware key
#   ./qa/scripts/adb.sh swipe up|down|left|right [px]
#   ./qa/scripts/adb.sh wait "Tasks" [timeout]  block until text appears
#   ./qa/scripts/adb.sh gone "Undo" [timeout]   block until text disappears
#   ./qa/scripts/adb.sh stop|launch|restart [pkg]
#   ./qa/scripts/adb.sh logs [grep-pattern]     filtered logcat
#   ./qa/scripts/adb.sh clearlogs
#   ./qa/scripts/adb.sh state                   device settings snapshot (for restore)
set -uo pipefail

ADB="${ADB:-adb}"
# Default target is Expo Go; override with PKG=app.marginalia.planner for the
# standalone release build.
PKG="${PKG:-host.exp.exponent}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHOTS="$(dirname "$HERE")/shots"
mkdir -p "$SHOTS"

die() { echo "adb.sh: $*" >&2; exit 1; }

# --- raw UI dump -------------------------------------------------------------
ui_dump_raw() {
  # uiautomator exits 0 even when it prints "could not get idle state", in which
  # case /sdcard/qa_ui.xml still holds the PREVIOUS dump. A stale tree is worse
  # than no tree: it silently reports another app's screen as ours. Detect and
  # refuse, so callers can retry instead of acting on a phantom UI.
  local out
  for _ in 1 2 3; do
    out="$($ADB shell uiautomator dump /sdcard/qa_ui.xml 2>&1)" || true
    if [[ "$out" != *"could not get idle state"* ]]; then
      $ADB exec-out cat /sdcard/qa_ui.xml 2>/dev/null && return 0
    fi
    sleep 1
  done
  echo "STALE_DUMP: uiautomator never went idle; refusing to return a stale tree" >&2
  return 1
}

# --- dump / texts ------------------------------------------------------------
cmd_dump() {
  local xml; xml="$(ui_dump_raw)" || die "uiautomator dump failed (app busy, or a modal has no a11y tree?)"
  printf '%s' "$xml" | python3 "$HERE/uiparse.py" --interactive-only
}

cmd_texts() {
  local xml; xml="$(ui_dump_raw)" || die "uiautomator dump failed"
  printf '%s' "$xml" | python3 "$HERE/uiparse.py" --interactive-only \
    | cut -f6,7 | awk -F'\t' '$1!=""{print $1}' | sort -u
}

# --- matching ----------------------------------------------------------------
# Resolve a user-supplied label to "cx cy" using exact match first, then substring.
resolve_xy() {
  local needle="$1" idx="${2:-0}" like=0
  if [[ "${3:-}" == "--like" ]]; then like=1; fi
  local xml; xml="$(ui_dump_raw)" || return 1
  local rows
  rows="$(printf '%s' "$xml" | python3 "$HERE/uiparse.py" --interactive-only)"

  # 1) exact match on text or content-desc
  local pick
  pick="$(printf '%s\n' "$rows" | awk -F'\t' -v n="$needle" -v k="$idx" \
      '($6==n || $7==n){c++; if(c>k){print $10" "$11; exit}}')"
  # 2) case-insensitive substring
  if [[ -z "$pick" && $like -eq 1 ]]; then
    pick="$(printf '%s\n' "$rows" | awk -F'\t' -v n="$needle" -v k="$idx" \
      '($6 ~ n || $7 ~ n){c++; if(c>k){print $10" "$11; exit}}')"
  fi
  [[ -n "$pick" ]] || return 1
  echo "$pick"
}

cmd_tap() {
  local idx=0 like=0
  while [[ $# -gt 1 ]]; do
    case "$1" in
      --idx) idx="$2"; shift 2;;
      --like) like=1; shift;;
      *) break;;
    esac
  done
  local needle="${1:-}" || die "tap needs a label"
  local xy; xy="$(resolve_xy "$needle" "$idx" "$like")" \
    || die "no element matching '$needle' (use 'dump' to see labels, or --like for substring)"
  # shellcheck disable=SC2086
  $ADB shell input tap $xy
  echo "tapped '$needle' at $xy"
}

cmd_tapx() { $ADB shell input tap "$1" "$2"; echo "tapped $1 $2"; }

# --- input -------------------------------------------------------------------
cmd_type() { $ADB shell input text "$(printf '%s' "$1" | sed 's/ /%s/g')"; }

cmd_key() {
  case "$1" in
    BACK) $ADB shell input keyevent 4;;
    HOME) $ADB shell input keyevent 3;;
    ENTER) $ADB shell input keyevent 66;;
    *) $ADB shell input keyevent "$1";;
  esac
}

cmd_swipe() {
  local dir="$1" dist="${2:-600}"
  local phys; phys="$($ADB shell wm size | awk '/Physical size/{print $3; exit}' | tr -d '\r')"
  local w="${phys%x*}" h="${phys#*x}"
  local cx=$(( w / 2 )) cy=$(( h / 2 )) half=$(( dist / 2 ))
  local x1 y1 x2 y2
  case "$dir" in
    up)    x1=$cx; y1=$(( cy + half )); x2=$cx; y2=$(( cy - half ));;  # content scrolls up
    down)  x1=$cx; y1=$(( cy - half )); x2=$cx; y2=$(( cy + half ));;
    left)  x1=$(( cx + half )); y1=$cy; x2=$(( cx - half )); y2=$cy;;  # content scrolls left
    right) x1=$(( cx - half )); y1=$cy; x2=$(( cx + half )); y2=$cy;;
    *) die "swipe direction must be up|down|left|right";;
  esac
  $ADB shell input swipe "$x1" "$y1" "$x2" "$y2" "${SWIPE_MS:-800}"
  echo "swiped $dir ($dist px, ${SWIPE_MS:-800}ms) from $x1,$y1 to $x2,$y2"
}

# --- waiting -----------------------------------------------------------------
cmd_wait() {
  local needle="$1" timeout="${2:-15}" waited=0
  while (( waited < timeout * 2 )); do
    if cmd_texts 2>/dev/null | grep -qF -- "$needle"; then echo "found '$needle' after ${waited}00ms"; return 0; fi
    sleep 0.5; waited=$((waited+1))
  done
  echo "TIMEOUT: '$needle' not found within ${timeout}s" >&2; return 1
}

cmd_gone() {
  local needle="$1" timeout="${2:-15}" waited=0
  while (( waited < timeout * 2 )); do
    if ! cmd_texts 2>/dev/null | grep -qF -- "$needle"; then echo "'$needle' gone after ${waited}00ms"; return 0; fi
    sleep 0.5; waited=$((waited+1))
  done
  echo "TIMEOUT: '$needle' still present after ${timeout}s" >&2; return 1
}

# --- app lifecycle -----------------------------------------------------------
cmd_stop()    { $ADB shell am force-stop "$PKG"; echo "force-stopped $PKG"; }
cmd_launch()  { $ADB shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; echo "launched $PKG"; }
cmd_restart() { cmd_stop; sleep 1; cmd_launch; }

# --- logs --------------------------------------------------------------------
cmd_logs() {
  local pat="${1:-ReactNativeJS|AndroidRuntime|ReactNative}"
  $ADB logcat -d -v brief 2>/dev/null \
    | grep -E "ReactNativeJS|AndroidRuntime|FATAL|expo.modules|Expo|" \
    grep -E "$pat" | tail -n "${LOGS_LIMIT:-200}"
}
cmd_clearlogs() { $ADB logcat -c; echo "logcat cleared"; }

# --- device state snapshot (record before mutating, restore after) -----------
cmd_state() {
  echo "font_scale=$(  $ADB shell settings get system font_scale | tr -d '\r')"
  echo "night=$($ADB shell cmd uimode night 2>/dev/null | grep -oE '(yes|no)$' | tr -d '\r')"
  echo "size=$($ADB shell wm size | grep -v Override | head -1 | tr -d '\r')"
  echo "density=$($ADB shell wm density | grep -v Override | head -1 | tr -d '\r')"
  echo "rotation=$($ADB shell settings get system user_rotation | tr -d '\r')"
  echo "accelerometer_rotation=$($ADB shell settings get system accelerometer_rotation | tr -d '\r')"
  echo "a11y_services=$($ADB shell settings get secure enabled_accessibility_services | tr -d '\r')"
}

cmd_shot() { $ADB exec-out screencap -p > "$SHOTS/$1.png"; echo "$SHOTS/$1.png"; }

case "${1:-}" in
  shot)       cmd_shot "${2:?name required}";;
  dump)       shift; cmd_dump "$@";;
  texts)      cmd_texts;;
  tap)        shift; cmd_tap "$@";;
  tapx)       shift; cmd_tapx "$@";;
  type)       shift; cmd_type "$@";;
  key)        shift; cmd_key "$@";;
  swipe)      shift; cmd_swipe "$@";;
  wait)       shift; cmd_wait "$@";;
  gone)       shift; cmd_gone "$@";;
  unlock)     $ADB shell wm dismiss-keyguard 2>/dev/null; sleep 1
              $ADB shell input swipe 540 1800 540 600 ${SWIPE_MS:-800}
              echo "keyguard dismiss attempted";;
  awake)      $ADB shell dumpsys power 2>/dev/null | grep -oE 'mWakefulness=[A-Za-z]+' | head -1;;
  locked)     $ADB shell dumpsys window 2>/dev/null | grep -qiE 'mShowingLockscreen|isStatusBarKeyguard' \
                && echo LOCKED || echo UNLOCKED;;
  stop)       cmd_stop;;
  launch)     cmd_launch;;
  restart)    cmd_restart;;
  logs)       shift; cmd_logs "$@";;
  clearlogs)  cmd_clearlogs;;
  state)      cmd_state;;
  *) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 1;;
esac