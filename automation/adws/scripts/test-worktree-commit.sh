#!/usr/bin/env bash
# Test script to verify worktree commit behavior with relative vs absolute paths

set -euo pipefail

WORKTREE_NAME="test-commit-$(date +%s)"
WORKTREE_PATH="trees/$WORKTREE_NAME"

echo "=== Testing worktree commit behavior ==="
echo "Creating test worktree: $WORKTREE_NAME"

# Create worktree
git worktree add "$WORKTREE_PATH" -b "$WORKTREE_NAME" develop

# Change to worktree
cd "$WORKTREE_PATH"

echo "=== Test 1: Relative path commit ==="
mkdir -p docs/specs
echo "test content" > docs/specs/test-plan.md
git add docs/specs/test-plan.md
git status --porcelain
git commit -m "test: relative path commit" && echo "SUCCESS: Relative path commit worked" || echo "FAILED: Relative path commit failed"

echo "=== Test 2: Absolute path (for reference) ==="
ABSOLUTE_FILE="$PWD/docs/specs/test-plan-2.md"
echo "test2 content" > "$ABSOLUTE_FILE"
echo "Created file at: $ABSOLUTE_FILE"
echo "Attempting to add with absolute path..."
git add "$ABSOLUTE_FILE" 2>&1 && echo "SUCCESS: Absolute path add worked" || echo "FAILED: Absolute path requires explicit handling"
git status --porcelain

# Cleanup
cd ../../..
echo "=== Cleanup ==="
git worktree remove "$WORKTREE_PATH" --force
git branch -D "$WORKTREE_NAME"

echo "=== Test complete ==="
