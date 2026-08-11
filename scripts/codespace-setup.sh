#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -s /usr/local/share/nvm/nvm.sh ]]; then
  # shellcheck disable=SC1091
  source /usr/local/share/nvm/nvm.sh
  nvm install --no-progress
  nvm use
fi

node -e 'const [major]=process.versions.node.split(".").map(Number); if(major<24){console.error("Calibration Studio requires Node.js 24 or newer."); process.exit(1)}'

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild node-pty --foreground-scripts || true
npm run runtime:install-browser
npm run gate:runtime
npm run gate
npm run perun

echo "Calibration Studio Codespace setup complete."
