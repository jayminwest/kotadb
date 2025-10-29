#!/usr/bin/env bash
#
# Test Frontend Examples Integration Script
#
# Runs all ADW frontend authentication examples sequentially and validates
# exit codes. Designed for CI integration and manual validation.
#
# Usage:
#   ./scripts/test-frontend-examples.sh
#
# Requirements:
#   - Dev server running at http://localhost:3001
#   - Python 3.9+ with httpx and asyncio
#   - Playwright helpers module installed

set -e

# Change to automation directory
cd "$(dirname "$0")/.."

exit_code=0

echo "Running ADW frontend authentication examples..."
echo ""

# Dashboard example
echo "1/3 Running dashboard authentication example..."
if python -m adws.adw_phases.test_frontend_dashboard; then
    echo "✓ Dashboard example passed"
else
    echo "✗ Dashboard example failed"
    exit_code=1
fi
echo ""

# Search example
echo "2/3 Running search flow example..."
if python -m adws.adw_phases.test_frontend_search; then
    echo "✓ Search example passed"
else
    echo "✗ Search example failed"
    exit_code=1
fi
echo ""

# Indexing example
echo "3/3 Running indexing flow example..."
if python -m adws.adw_phases.test_frontend_indexing; then
    echo "✓ Indexing example passed"
else
    echo "✗ Indexing example failed"
    exit_code=1
fi
echo ""

# Summary
if [ $exit_code -eq 0 ]; then
    echo "All frontend examples passed"
else
    echo "One or more examples failed"
fi

exit $exit_code
