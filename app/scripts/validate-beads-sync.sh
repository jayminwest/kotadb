#!/bin/bash
# Validates .beads/issues.jsonl syntax for CI integration
# Skips validation if .beads/ directory doesn't exist (no false failures on fresh clones)

set -e

BEADS_DIR="../.beads"
ISSUES_JSONL="../.beads/issues.jsonl"

# Check if .beads directory exists
if [ ! -d "$BEADS_DIR" ]; then
  echo "✓ Beads validation skipped: .beads/ directory not found"
  exit 0
fi

# Check if issues.jsonl exists
if [ ! -f "$ISSUES_JSONL" ]; then
  echo "✗ Beads validation failed: .beads/issues.jsonl not found"
  exit 1
fi

# Validate JSONL syntax using jq
# Each line must be valid JSON (JSONL format)
echo "Validating .beads/issues.jsonl syntax..."

# Check if file is empty (valid case - no issues yet)
if [ ! -s "$ISSUES_JSONL" ]; then
  echo "✓ Beads validation passed: 0 issue(s) validated (empty file)"
  exit 0
fi

# Count lines for reporting
line_count=$(wc -l < "$ISSUES_JSONL" | tr -d ' ')

# Validate each line is valid JSON
# Use jq -c to compact each line, then validate
if cat "$ISSUES_JSONL" | while IFS= read -r line; do
  echo "$line" | jq -e . > /dev/null 2>&1 || exit 1
done; then
  echo "✓ Beads validation passed: $line_count issue(s) validated"
  exit 0
else
  echo "✗ Beads validation failed: Invalid JSON structure in issues.jsonl"
  exit 1
fi
