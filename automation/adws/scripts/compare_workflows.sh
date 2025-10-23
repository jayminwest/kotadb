#!/usr/bin/env bash
#
# compare_workflows.sh - Side-by-side comparison wrapper for atomic vs legacy workflows
#
# Usage:
#   ./automation/adws/scripts/compare_workflows.sh 123
#   ./automation/adws/scripts/compare_workflows.sh 123 --verbose
#   ./automation/adws/scripts/compare_workflows.sh 123 --output results/issue-123.json
#
# Requirements:
#   - Python 3.12+
#   - uv package manager
#   - GitHub issue access via gh CLI

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# Parse arguments
ISSUE_NUMBER="${1:-}"
VERBOSE_FLAG=""
OUTPUT_FLAG=""

if [ -z "$ISSUE_NUMBER" ]; then
    echo -e "${RED}Error: Issue number required${NC}"
    echo "Usage: $0 <issue_number> [--verbose] [--output <file>]"
    exit 1
fi

shift # Remove issue number from args

# Parse remaining arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --verbose|-v)
            VERBOSE_FLAG="--verbose"
            shift
            ;;
        --output|-o)
            OUTPUT_FLAG="--output $2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Verify issue exists
echo -e "${YELLOW}Verifying issue #${ISSUE_NUMBER} exists...${NC}"
if ! gh issue view "$ISSUE_NUMBER" --json number > /dev/null 2>&1; then
    echo -e "${RED}Error: Issue #${ISSUE_NUMBER} not found${NC}"
    exit 1
fi

# Display issue metadata
echo -e "${GREEN}Issue found:${NC}"
gh issue view "$ISSUE_NUMBER" --json number,title,labels,state --template \
    '  Number: {{.number}}
  Title: {{.title}}
  Labels: {{range .labels}}{{.name}} {{end}}
  State: {{.state}}
'

# Run side-by-side test
echo -e "\n${YELLOW}Running side-by-side workflow comparison...${NC}"
cd "$PROJECT_ROOT" || exit 1

# Execute Python test script
if uv run python automation/adws/scripts/test_atomic_workflow.py \
    --issue "$ISSUE_NUMBER" \
    --mode both \
    $VERBOSE_FLAG \
    $OUTPUT_FLAG; then
    echo -e "\n${GREEN}✓ Comparison completed successfully${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Comparison failed${NC}"
    exit 1
fi
