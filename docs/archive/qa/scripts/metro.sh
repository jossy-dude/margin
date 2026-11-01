#!/usr/bin/env bash
# Metro lifecycle for Margin QA. Kept in a file on purpose: doing this
# inline means the pkill pattern ends up in the caller's own command line and
# pkill -f happily kills the caller.
#
#   qa/scripts/metro.sh start [--no-dev] [--minify] [--reset-cache]
#   qa/scripts/metro.sh stop
#   qa/scripts/metro.sh restart [same flags]
#   qa/scripts/metro.sh status
#
# Metro is started detached with setsid so it outlives the shell that spawned
# it, and always with stdin closed. A detached Expo CLI has no TTY, so it
# reports "CI mode": that disables push-refresh only, not bundle freshness.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-8081}"
LOG="$ROOT/.expo-server.log"
UNIT="marginalia-metro"

# Match the real process, never this script's caller.
pat() { printf '%s' "$1"; }

metro_pids() { pgrep -f "$(pat 'node_modules/.bin/expo')" 2>/dev/null; }

stop() {
  local pids; pids="$(metro_pids)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null
    sleep 2
    pids="$(metro_pids)"
    # shellcheck disable=SC2086
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null
  fi
  echo "metro stopped"
}

start() {
  cd "$ROOT" || exit 1
  setsid nohup npx expo start --go --port "$PORT" "$@" \
    < /dev/null > "$LOG" 2>&1 &
  disown
  echo "metro starting on :$PORT (log: $LOG)"
}

wait_ready() {
  local tries=0
  while (( tries < 60 )); do
    if curl -fs -m 2 "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
      echo "metro ready on :$PORT"; return 0
    fi
    sleep 1; tries=$((tries+1))
  done
  echo "metro did NOT become ready in 60s" >&2
  tail -30 "$LOG" >&2
  return 1
}

status() {
  if [[ -n "$(metro_pids)" ]]; then
    echo "running (pids: $(metro_pids | tr '\n' ' '))"
  else
    echo "not running"
  fi
  tail -12 "$LOG" 2>/dev/null
}

case "${1:-status}" in
  start)   start "${@:2}"; wait_ready ;;
  stop)    stop ;;
  restart) stop; start "${@:2}"; wait_ready ;;
  status)  status ;;
  *)       sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 1 ;;
esac