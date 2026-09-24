#!/bin/bash
# SessionStart hook for Claude Code on the web: install npm dependencies so the
# type check, build and tsx checks work immediately. Idempotent: skips the
# install when node_modules is already in sync with package-lock.json.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm is the chosen package manager (see docs/mvp/PROGRESS.md). bun.lock is not used.
if [ -f node_modules/.package-lock.json ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  echo "session-start: node_modules up to date, skipping npm ci"
else
  npm ci --no-audit --no-fund
fi
