#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -s /usr/local/share/nvm/nvm.sh ]]; then
  # shellcheck disable=SC1091
  source /usr/local/share/nvm/nvm.sh
  nvm use --silent >/dev/null
fi

PORT="${CALIBRATION_STUDIO_PORT:-4317}"
HEALTH="http://127.0.0.1:${PORT}/api/health"
LOG="${TMPDIR:-/tmp}/calibration-studio-${PORT}.log"
PIDFILE="${TMPDIR:-/tmp}/calibration-studio-${PORT}.pid"

if curl --fail --silent --max-time 1 "$HEALTH" >/dev/null 2>&1; then
  exit 0
fi

if [[ -f "$PIDFILE" ]]; then
  OLD_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ "$OLD_PID" =~ ^[0-9]+$ ]] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
    kill "$OLD_PID" >/dev/null 2>&1 || true
    sleep 1
  fi
fi

nohup node bin/studio.js --no-open --port "$PORT" >"$LOG" 2>&1 </dev/null &
echo "$!" >"$PIDFILE"

for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 1 "$HEALTH" >/dev/null 2>&1; then
    echo "Calibration Studio ready on 127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "Calibration Studio failed to become ready. Log: $LOG" >&2
tail -n 80 "$LOG" >&2 || true
exit 1
