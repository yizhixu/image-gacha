#!/usr/bin/env bash
# One-click local deployment for AI Gacha Images (Next.js)
# Usage:
#   bash run.sh               # production build + start on PORT (default 3000)
#   bash run.sh --dev         # start dev server
#   bash run.sh --port 4000   # override port
#   bash run.sh --no-install  # skip npm install/ci
#   bash run.sh --open        # auto-open browser when server is ready

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"
MODE="prod"
DO_INSTALL=1
AUTO_OPEN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) MODE="dev"; shift ;;
    --prod) MODE="prod"; shift ;;
    --no-install) DO_INSTALL=0; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --open) AUTO_OPEN=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { printf "\033[1;34m[INFO]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[ERR ]\033[0m %s\n" "$*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; exit 1; }
}

parse_semver() {
  # echo "18.19.1" -> "18 19 1"
  local v="${1#v}"
  IFS='.' read -r major minor patch <<< "$v"
  echo "${major:-0} ${minor:-0} ${patch:-0}"
}

version_ge() {
  # return 0 if $1 >= $2 (semver)
  local a_major a_minor a_patch b_major b_minor b_patch
  read -r a_major a_minor a_patch <<< "$(parse_semver "$1")"
  read -r b_major b_minor b_patch <<< "$(parse_semver "$2")"
  if (( a_major > b_major )); then return 0; fi
  if (( a_major < b_major )); then return 1; fi
  if (( a_minor > b_minor )); then return 0; fi
  if (( a_minor < b_minor )); then return 1; fi
  if (( a_patch >= b_patch )); then return 0; fi
  return 1
}

need_cmd node
need_cmd npm

NODE_VER="$(node -v 2>/dev/null || echo "0.0.0")"
REQUIRED_NODE="18.17.0"
if ! version_ge "$NODE_VER" "$REQUIRED_NODE"; then
  err "Node.js >= $REQUIRED_NODE is required. Current: $NODE_VER"
  err "Please upgrade Node (e.g., via nvm: nvm install 18 && nvm use 18)"
  exit 1
fi

# Open URL helper (macOS 'open', Linux 'xdg-open', Windows Git Bash 'powershell.exe')
open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe start "$url" >/dev/null 2>&1 || true
  else
    warn "Could not auto-open browser. Please open: $url"
  fi
}

start_open_background() {
  local url="http://localhost:${PORT}"
  if [[ "$AUTO_OPEN" -eq 1 ]]; then
    (
      if command -v curl >/dev/null 2>&1; then
        # wait up to ~20s for server readiness
        for i in {1..40}; do
          curl -sf "$url" >/dev/null 2>&1 && break
          sleep 0.5
        done
      else
        sleep 2
      fi
      open_url "$url"
    ) &
  fi
}

# Prepare env
if [[ ! -f ".env.local" ]]; then
  if [[ -f ".env.example" ]]; then
    log "Creating .env.local from .env.example"
    cp .env.example .env.local
    warn "Please edit .env.local to set KIE_API_KEY, endpoints, and (optionally) OPENROUTER_API_KEY."
  else
    warn "No .env.local found and .env.example missing. Proceeding without env file."
  fi
fi

# Install deps
if [[ "$DO_INSTALL" -eq 1 ]]; then
  if [[ -f "package-lock.json" ]]; then
    log "Installing dependencies with npm ci"
    npm ci
  else
    log "Installing dependencies with npm install"
    npm install
  fi
else
  log "Skipping dependency installation (--no-install)"
fi

# Start
if [[ "$MODE" == "dev" ]]; then
  log "Starting development server on http://localhost:${PORT}"
  log "Press Ctrl+C to stop."
  start_open_background
  # Next.js dev respects PORT env var
  PORT="$PORT" npm run dev
else
  log "Building production bundles"
  npm run build
  log "Starting production server on http://localhost:${PORT}"
  log "Press Ctrl+C to stop."
  start_open_background
  PORT="$PORT" npm run start
fi
