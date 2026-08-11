#!/bin/sh
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Calibration Studio requires Node.js 24 or newer."
  printf "Press Return to close…"
  read _
  exit 1
fi
node bin/studio-launch.js "$@"
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  printf "\nCalibration Studio stopped with an error. Press Return to close…"
  read _
fi
exit "$STATUS"
