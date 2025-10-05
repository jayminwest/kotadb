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

if [[ -z "${REPO_URL}" ]]; then
  REPO_URL="$(git remote get-url origin 2>/dev/null || echo "")"
fi

if [[ -n "${GITHUB_PAT:-}" ]]; then
  if [[ -n "${REPO_URL}" && "${REPO_URL}" == https://* ]]; then
    AUTH_URL="https://${GITHUB_PAT}@${REPO_URL#https://}"
    git remote set-url origin "${AUTH_URL}"
  else
    git remote set-url origin "https://${GITHUB_PAT}@github.com/${GITHUB_REPOSITORY:-kotadb/kotadb}.git"
  fi
elif [[ -n "${REPO_URL}" ]]; then
  git remote set-url origin "${REPO_URL}"
fi

git fetch --prune origin "${REPO_REF}" >/dev/null 2>&1 || git fetch --prune origin >/dev/null 2>&1

if git show-ref --quiet "refs/heads/${REPO_REF}"; then
  git checkout "${REPO_REF}"
else
  git checkout -B "${REPO_REF}" "origin/${REPO_REF}" 2>/dev/null || git checkout "origin/${REPO_REF}" -B "${REPO_REF}"
fi

git reset --hard "origin/${REPO_REF}"

if [[ -n "${GITHUB_PAT:-}" ]]; then
  export GH_TOKEN="${GH_TOKEN:-$GITHUB_PAT}"
fi

git config --global user.email "${GIT_AUTHOR_EMAIL:-bot@kotadb.local}"
git config --global user.name "${GIT_AUTHOR_NAME:-KotaDB ADW Bot}"
git config --global pull.rebase false

export ISSUE_NUMBER
export ADW_ID

exec uv run adws/adw_plan_build.py "${ISSUE_NUMBER}" "${ADW_ID}"
