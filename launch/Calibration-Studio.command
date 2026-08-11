#!/usr/bin/env bash
set -euo pipefail

REPO="altrudev/Calibration-Studio"
BRANCH="main"
PORT="4317"
API_VERSION="2026-03-10"
URL="http://127.0.0.1:${PORT}"
TUNNEL_LOG="${TMPDIR:-/tmp}/calibration-studio-codespace-tunnel.log"

fail() { printf 'Calibration Studio launcher: %s\n' "$*" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || fail "GitHub CLI (gh) is required."
command -v curl >/dev/null 2>&1 || fail "curl is required."

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub authentication is required once."
  gh auth login
fi

find_codespace() {
  gh codespace list -R "$REPO" -L 30 --json name,lastUsedAt \
    --jq 'sort_by(.lastUsedAt) | reverse | .[0].name // ""'
}

create_codespace() {
  local machine
  machine="$(gh api -H "X-GitHub-Api-Version: ${API_VERSION}" "repos/${REPO}/codespaces/machines" --jq '.machines | min_by(.cpus).name')"
  [[ -n "$machine" ]] || fail "No Codespaces machine type is available for ${REPO}."
  echo "Creating a low-core Calibration Studio Codespace (${machine})..."
  gh codespace create -R "$REPO" -b "$BRANCH" -m "$machine" \
    -d "Calibration Studio" \
    --idle-timeout 15m \
    --retention-period 168h \
    --devcontainer-path .devcontainer/devcontainer.json >/dev/null
}

wait_state() {
  local expected="$1"
  for _ in $(seq 1 90); do
    local state
    state="$(gh codespace view -c "$CODESPACE" --json state --jq '.state' 2>/dev/null || true)"
    [[ "$state" == "$expected" ]] && return 0
    sleep 2
  done
  return 1
}

start_codespace() {
  local state
  state="$(gh codespace view -c "$CODESPACE" --json state --jq '.state' 2>/dev/null || true)"
  if [[ "$state" != "Available" ]]; then
    echo "Starting Codespace ${CODESPACE}..."
    gh api -X POST -H "X-GitHub-Api-Version: ${API_VERSION}" \
      "user/codespaces/${CODESPACE}/start" >/dev/null
    wait_state "Available" || fail "Codespace did not become available."
  fi
}

restart_codespace() {
  echo "Restarting Codespace ${CODESPACE}..."
  gh codespace stop -c "$CODESPACE" >/dev/null 2>&1 || true
  wait_state "Shutdown" || true
  gh api -X POST -H "X-GitHub-Api-Version: ${API_VERSION}" \
    "user/codespaces/${CODESPACE}/start" >/dev/null
  wait_state "Available" || fail "Codespace restart did not complete."
}

prepare_remote_studio() {
  # Fast-forward only; never reset or discard user changes.
  gh codespace ssh -c "$CODESPACE" \
    "cd /workspaces/Calibration-Studio && (git pull --ff-only origin main || true) && bash scripts/codespace-studio-start.sh" \
    >/dev/null
}

local_tunnel_ready() {
  local response
  response="$(curl --fail --silent --max-time 2 "${URL}/api/status" 2>/dev/null || true)"
  [[ "$response" == *"\"name\": \"${CODESPACE}\""* ]]
}

start_tunnel() {
  if local_tunnel_ready; then return 0; fi
  : >"$TUNNEL_LOG"
  nohup gh codespace ports forward "${PORT}:${PORT}" -c "$CODESPACE" \
    >"$TUNNEL_LOG" 2>&1 </dev/null &
}

wait_tunnel() {
  for _ in $(seq 1 60); do
    local_tunnel_ready && return 0
    sleep 1
  done
  return 1
}

open_dashboard() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open "$URL" >/dev/null 2>&1 || true
  else
    xdg-open "$URL" >/dev/null 2>&1 || true
  fi
}

CODESPACE="$(find_codespace)"
if [[ -z "$CODESPACE" ]]; then
  create_codespace
  CODESPACE="$(find_codespace)"
fi
[[ -n "$CODESPACE" ]] || fail "Could not resolve the Calibration Studio Codespace."

if [[ "${1:-}" == "restart" ]]; then
  restart_codespace
else
  start_codespace
fi

prepare_remote_studio
start_tunnel

if ! wait_tunnel; then
  echo "Studio tunnel did not become ready; performing one automatic Codespace restart..."
  restart_codespace
  prepare_remote_studio
  start_tunnel
  wait_tunnel || fail "Studio did not become ready. See ${TUNNEL_LOG}."
fi

echo "Calibration Studio ready at ${URL}"
open_dashboard
