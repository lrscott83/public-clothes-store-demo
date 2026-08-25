#!/usr/bin/env bash
#
# deploy.sh — build and (re)deploy the catalog stack on a Podman-based VPS.
#
# First run:  bash deploy.sh            (from the repo root)
# Updates:    re-run the same script; compose recreates only changed services.
#
# Prerequisites: podman + a compose provider reachable through `podman compose`
# (podman-compose, or the docker-compose wrapper configured as the compose
# provider), plus git and curl.
# Secrets: create templates/.env before the FIRST run and override at least
# JWT_SECRET, REFRESH_TOKEN_SECRET and SESSION_SECRET (see templates/README.md).
set -euo pipefail

cd "$(dirname "$0")"

# --- Podman detection -------------------------------------------------------
if command -v podman >/dev/null 2>&1; then
  PODMAN_CMD="podman"
else
  echo "ERROR: 'podman' was not found in PATH." >&2
  echo "Install Podman first: https://podman.io/docs/installation" >&2
  exit 1
fi

# `podman compose` is a thin wrapper that delegates to an external provider
# (podman-compose or docker-compose). Fail fast with a clear message when none
# is installed instead of dying mid-build.
if ! "$PODMAN_CMD" compose version >/dev/null 2>&1; then
  echo "ERROR: '$PODMAN_CMD compose' has no compose provider installed." >&2
  echo "Install one of:" >&2
  echo "  pip install podman-compose          # pure-python provider" >&2
  echo "  # or install docker-compose and point Podman's compose_provider at it" >&2
  echo "  #    (containers.conf [engine] compose_provider — see podman-systemd.unit / podman docs)" >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull --ff-only

cd templates

echo "==> Building images with $PODMAN_CMD compose (context: templates/, turbo builds apps + deps)"
"$PODMAN_CMD" compose build

echo "==> Starting stack (postgres -> migrate -> apis -> web)"
# postgres starts first; migrate applies pending migrations one-shot;
# every app waits for migrate to complete successfully via depends_on.
"$PODMAN_CMD" compose up -d --remove-orphans

echo "==> Waiting for health endpoints"
check () {
  # check <name> <url> <accept-any-status: 0|1>
  local name="$1" url="$2" any="$3" attempts=20 code=""
  for _ in $(seq 1 "$attempts"); do
    # -s silent, -o /dev/null discard body, -w status code, --max-time per try
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
    if [ "$any" = "1" ] && [ "$code" != "000" ]; then
      echo "  [up]     $name ($url -> HTTP $code)"
      return 0
    elif [ "$code" = "200" ]; then
      echo "  [ok]     $name ($url)"
      return 0
    fi
    sleep 3
  done
  echo "  [FAIL]   $name ($url -> last HTTP $code) — check: podman compose logs $name"
  return 1
}

# api-idp exposes no /health route yet — accept ANY http response as "up".
check api-idp      http://localhost:4902/ || true
check api-salesops http://localhost:4901/health || true
check api-public   http://localhost:4903/health || true
check web          http://localhost:3900/ || true

echo "==> Pruning dangling images"
"$PODMAN_CMD" image prune -f

echo
echo "Running services:"
"$PODMAN_CMD" compose ps
echo
echo "Done. Seed the database explicitly with:"
echo "  cd templates && podman compose --profile seed run --rm seed"
