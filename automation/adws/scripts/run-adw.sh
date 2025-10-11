#!/usr/bin/env bash

set -euo pipefail

if [[ "${ADW_RUNNER_DEBUG:-0}" == "1" ]]; then
  set -x
fi

ISSUE_NUMBER="${1:-${ISSUE_NUMBER:-}}"
ADW_ID="${2:-${ADW_ID:-}}"

if [[ -z "${ISSUE_NUMBER}" ]]; then
  echo "[run-adw] ISSUE_NUMBER argument or environment variable is required" >&2
  exit 1
fi

if [[ -z "${ADW_ID}" ]]; then
  echo "[run-adw] ADW_ID argument or environment variable is required" >&2
  exit 1
fi

REPO_REF="${ADW_GIT_REF:-main}"
REPO_URL="${ADW_REPO_URL:-}"

cd /workspace

# Get the current origin URL as fallback
CURRENT_ORIGIN="$(git remote get-url origin 2>/dev/null || echo "")"

# Default to kotadb/kotadb if no repo URL is specified
if [[ -z "${REPO_URL}" ]]; then
  REPO_URL="${CURRENT_ORIGIN:-https://github.com/kotadb/kotadb.git}"
fi

# Only set origin if explicitly provided via ADW_REPO_URL
# This prevents accidentally overriding the correct origin
if [[ -n "${ADW_REPO_URL:-}" ]]; then
  if [[ -n "${GITHUB_PAT:-}" ]]; then
    if [[ "${REPO_URL}" == https://* ]]; then
      AUTH_URL="https://${GITHUB_PAT}@${REPO_URL#https://}"
      git remote set-url origin "${AUTH_URL}"
    else
      git remote set-url origin "https://${GITHUB_PAT}@github.com/${GITHUB_REPOSITORY:-kotadb/kotadb}.git"
    fi
  else
    git remote set-url origin "${REPO_URL}"
  fi
elif [[ -n "${GITHUB_PAT:-}" ]]; then
  # Add PAT authentication to existing origin
  if [[ "${REPO_URL}" == https://* ]]; then
    AUTH_URL="https://${GITHUB_PAT}@${REPO_URL#https://}"
    git remote set-url origin "${AUTH_URL}"
  fi
fi

git fetch --prune origin "${REPO_REF}" >/dev/null 2>&1 || git fetch --prune origin >/dev/null 2>&1

git reset --hard >/dev/null 2>&1 || true
git clean -fd >/dev/null 2>&1 || true

if git show-ref --quiet "refs/heads/${REPO_REF}"; then
  git checkout -f "${REPO_REF}"
else
  git checkout -B "${REPO_REF}" "origin/${REPO_REF}" 2>/dev/null || git checkout -f "origin/${REPO_REF}" -B "${REPO_REF}"
fi

git reset --hard "origin/${REPO_REF}" >/dev/null 2>&1

if [[ -n "${GITHUB_PAT:-}" ]]; then
  export GH_TOKEN="${GH_TOKEN:-$GITHUB_PAT}"
fi

git config --global user.email "${GIT_AUTHOR_EMAIL:-bot@kotadb.local}"
git config --global user.name "${GIT_AUTHOR_NAME:-KotaDB ADW Bot}"
git config --global pull.rebase false

if [[ -f "app/bun.lock" || -f "app/package.json" ]]; then
  cd app && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null 2>&1 && cd ..
fi

export ISSUE_NUMBER
export ADW_ID

exec uv run automation/adws/adw_plan_build.py "${ISSUE_NUMBER}" "${ADW_ID}"
