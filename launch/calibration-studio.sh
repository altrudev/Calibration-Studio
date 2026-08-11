#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
if ! command -v node >/dev/null 2>&1; then
  echo "Calibration Studio requires Node.js 24 or newer." >&2
  exit 1
fi
exec node bin/studio-launch.js "$@"
