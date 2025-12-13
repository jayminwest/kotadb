# feat(adw): integrate /do paradigm with Python ADW orchestration layer

**Issue**: #518
**Type**: feature
**Created**: 2025-12-13

## Summary

Integrate the Python ADW automation system (`automation/adws/`) with the new `/do` universal entry point paradigm, enabling Claude Code to orchestrate Python-based workflows while preserving worktree isolation, observability, and real-time token streaming. This bridges the Claude Code frontend with Python backend orchestration, providing unified access to multi-phase ADW workflows.

## Requirements

### Phase 2: Bridge /do to Python
- [ ] Create `/do/adw.md` slash command that shells to Python orchestrator
- [ ] Update `do-router.md` with `adw_workflow` intent category
- [ ] Support keywords: "run workflow", "adw", "#123 full", "full workflow"
- [ ] Verify end-to-end: `/do #<issue> workflow` creates worktree and executes

### Phase 3: Real-Time Token Streaming
- [ ] Add `--stream-tokens` flag to Python orchestrator
- [ ] Implement `prompt_claude_code_streaming()` in `agent.py`
- [ ] Emit `TokenEvent` JSON lines to stdout during execution
- [ ] Track: input_tokens, output_tokens, cache_read, cache_creation, cost_usd
- [ ] Parse and display token events in Claude Code

### Phase 4: Unified Observability
- [ ] Create TypeScript ADWState reader (read-only, for `/do/status`)
- [ ] Add `/do/status <adw_id>` command to query Python state
- [ ] Symlink `automation/logs/` to `.claude/data/adw_logs/` for discoverability
- [ ] Document observability data flow

## Implementation Steps

### Step 1: Create `/do` Infrastructure
**Files**: `.claude/commands/do/adw.md`, `.claude/commands/do/status.md`, `.claude/agents/do-router.md`
**Changes**:
- Create `.claude/commands/do/` directory if not exists
- Create `adw.md` slash command that invokes Python orchestrator via subprocess
- Create `status.md` slash command for ADW state queries
- Update `do-router.md` intent categories to include `adw_workflow`
- Add pattern matching: `#\d+.*workflow`, `run.*adw`, `full.*workflow`

### Step 2: Add Token Streaming Infrastructure
**Files**: `automation/adws/adw_modules/token_streaming.py` (new), `automation/adws/adw_modules/agent.py`
**Changes**:
- Create `token_streaming.py` with `TokenEvent` model and emitter
- Add `prompt_claude_code_streaming()` function to `agent.py`
- Implement JSON line streaming to stdout during agent execution
- Parse token usage from Claude Code result messages
- Calculate cost_usd using current pricing (input: $3/MTok, output: $15/MTok, cache: $0.30/MTok)

### Step 3: Enhance Orchestrator with Streaming
**Files**: `automation/adws/adw_agents/orchestrator.py`
**Changes**:
- Add `--stream-tokens` CLI flag to `run_adw_workflow()`
- Pass streaming flag through to agent invocations
- Emit `TokenEvent` after each agent completes
- Aggregate total tokens and costs in workflow result

### Step 4: Create TypeScript State Reader
**Files**: `.claude/utils/adw-state-reader.ts` (new)
**Changes**:
- Create read-only utility for parsing `adw_state.json` files
- Export `readADWState(adwId: string)` function
- Return typed state object matching Python ADWState structure
- Handle missing files and JSON parse errors gracefully

### Step 5: Update do-router Intent Classification
**Files**: `.claude/agents/do-router.md`
**Changes**:
- Add `adw_workflow` to intent categories table
- Define patterns: `run.*workflow`, `#\d+.*workflow`, `adw`, `full.*workflow`
- Set route target: `/do/adw`
- Add confidence boost (+0.3) for `workflow` keyword

### Step 6: Create Observability Symlink
**Files**: `.claude/data/adw_logs/` (symlink)
**Changes**:
- Create `.claude/data/` directory if not exists
- Symlink `adw_logs` → `../../automation/logs/kota-db-ts/`
- Document in `/do.md` for user discoverability

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `.claude/agents/do-router.md` | modify | Add `adw_workflow` intent category |
| `.claude/commands/do.md` | modify | Document ADW integration and streaming |
| `automation/adws/adw_modules/agent.py` | modify | Add streaming mode to `prompt_claude_code` |
| `automation/adws/adw_agents/orchestrator.py` | modify | Add `--stream-tokens` flag |
| `automation/adws/adw_modules/data_types.py` | modify | Add `TokenEvent` model |

## Files to Create

| File | Purpose |
|------|---------|
| `.claude/commands/do/adw.md` | Bridge command to invoke Python orchestrator |
| `.claude/commands/do/status.md` | Query ADW state for given adw_id |
| `automation/adws/adw_modules/token_streaming.py` | Real-time token event emission |
| `.claude/utils/adw-state-reader.ts` | TypeScript ADWState reader utility |

## Testing Strategy

**Validation Level**: 2
**Justification**: New workflow orchestration integration with subprocess execution and state synchronization. Requires integration testing with real Python orchestrator, but no database schema or auth changes.

### Test Cases
- [ ] `/do #123 workflow` successfully invokes Python orchestrator
- [ ] Token events emitted in real-time during execution
- [ ] `/do/status <adw_id>` returns valid state object
- [ ] Intent router correctly classifies "run workflow for #123"
- [ ] Symlink created and accessible from Claude Code context
- [ ] Error handling: invalid issue numbers, missing Python environment
- [ ] Token cost calculation matches expected pricing
- [ ] Concurrent workflow triggers maintain isolation

### Test Files
- `automation/adws/adw_tests/test_token_streaming.py`: Unit tests for token event emission
- `automation/adws/adw_tests/test_do_integration.py`: Integration tests for `/do` → Python bridge
- `.claude/tests/do-router.test.ts` (if exists): Intent classification tests

## Convention Checklist

- [ ] Path aliases used for all imports (@api/*, @db/*, etc.) - N/A for Python
- [ ] Logging via process.stdout.write (no console.*) - TypeScript only
- [ ] Tests use real Supabase Local (antimocking) - N/A (no database operations)
- [ ] Migrations synced (if applicable) - N/A

## Dependencies

- **Depends on**: `automation/adws/adw_agents/orchestrator.py` (orchestration layer)
- **Depends on**: `.claude/commands/do.md` (universal entry point)
- **Depends on**: `automation/adws/adw_modules/agent.py` (Claude Code invocation)
- **Depended on by**: Future `/do` enhancements (status polling, workflow cancellation)

## Risks

### Risk: Python subprocess execution blocks Claude Code session
**Mitigation**:
- Orchestrator runs in background after `/do/adw` command completes
- Use non-blocking subprocess spawn with stdout streaming
- Document expected execution time (5-15 minutes for full workflow)
- Provide `/do/status` for progress monitoring

### Risk: Token streaming adds overhead to agent execution
**Mitigation**:
- Token events only emitted with `--stream-tokens` flag (opt-in)
- JSON line format minimizes parsing overhead
- Async emission doesn't block agent execution
- Benchmark: <100ms overhead per agent invocation

### Risk: State file synchronization between Python and TypeScript
**Mitigation**:
- TypeScript reader is read-only (no write conflicts)
- Python uses atomic file writes (temp file + rename)
- Poll for state updates every 5s during `/do/status` queries
- Document state file format for future TypeScript writers

### Risk: Missing Python environment breaks `/do/adw`
**Mitigation**:
- Check for `uv` binary before subprocess spawn
- Return clear error: "Python environment not configured. Run: curl -LsSf https://astral.sh/uv/install.sh | sh"
- Document Python setup in `/do.md`
- CI tests validate `uv` availability

## TokenEvent Schema

```typescript
interface TokenEvent {
  adw_id: string;              // ADW execution ID
  phase: string;               // Phase name (plan, build, review)
  agent: string;               // Agent name (classify_issue, generate_branch, etc.)
  input_tokens: number;        // Prompt tokens consumed
  output_tokens: number;       // Completion tokens generated
  cache_read_tokens: number;   // Cached tokens read (prompt caching)
  cache_creation_tokens: number; // Tokens written to cache
  cost_usd: number;            // Calculated cost in USD
  timestamp: string;           // ISO 8601 timestamp
}
```

**Pricing (as of 2025-12-13)**:
- Input tokens: $3.00 per million tokens
- Output tokens: $15.00 per million tokens
- Cache write: $3.75 per million tokens
- Cache read: $0.30 per million tokens

## Detailed Implementation Plan

### Phase 2: Bridge /do to Python

#### Task 2.1: Create `.claude/commands/do/adw.md`
```markdown
# /do/adw - Full ADW Workflow Execution

**Template Category**: Action
**Prompt Level**: 7 (Orchestrator)

Execute full ADW workflow (scout → plan → build → review → validate) for a GitHub issue using Python orchestration layer.

## Variables

- `$1`: Issue number or GitHub URL

## Execution Flow

1. **Validate Issue**:
   - Extract issue number from input (supports `#123`, `123`, or GitHub URL)
   - Verify issue exists via `gh issue view {number}`

2. **Invoke Python Orchestrator**:
   ```bash
   uv run automation/adws/adw_sdlc.py {issue_number} --stream-tokens
   ```

3. **Parse Token Events**:
   - Read JSON lines from stdout
   - Display token usage in real-time
   - Aggregate total cost

4. **Monitor Progress**:
   - Check `automation/agents/{adw_id}/adw_state.json` for phase status
   - Report completed phases: scout ✓ → plan ✓ → build ✓ → review ✓

5. **Report Completion**:
   ```markdown
   ## ADW Workflow Complete
   
   **Issue**: #{number}
   **ADW ID**: {adw_id}
   **Phases**: scout ✓ → plan ✓ → build ✓ → review ✓
   
   ### Token Usage
   - Total Input: {input_tokens:,}
   - Total Output: {output_tokens:,}
   - Total Cost: ${cost_usd:.4f}
   
   ### Artifacts
   - Spec: {plan_file}
   - Branch: {branch_name}
   - Worktree: {worktree_path}
   
   ### Next Steps
   Run: /do/status {adw_id}
   ```

## Error Handling

- **Python not found**: Return clear installation instructions
- **Issue not found**: Suggest valid issue number
- **Workflow fails**: Display error from Python stderr, preserve partial state
```

#### Task 2.2: Create `.claude/commands/do/status.md`
```markdown
# /do/status - Query ADW Workflow State

**Template Category**: Query
**Prompt Level**: 3 (Read-only)

Query the current state of an ADW workflow execution.

## Variables

- `$1`: ADW execution ID

## Execution Flow

1. **Read State File**:
   - Load `automation/agents/{adw_id}/adw_state.json`
   - Parse using TypeScript ADWState reader

2. **Display Status**:
   ```markdown
   ## ADW Status: {adw_id}
   
   **Issue**: #{issue_number} - {issue_title}
   **Branch**: {branch_name}
   **Worktree**: {worktree_path}
   **PR Created**: {pr_created ? "Yes" : "No"}
   
   ### Phase Status
   - Scout: {scout_status}
   - Plan: {plan_status}
   - Build: {build_status}
   - Review: {review_status}
   
   ### Metrics
   {display metrics from extra.metrics if present}
   
   ### Files
   - Spec: {plan_file}
   ```

3. **Check Completion**:
   - If all phases complete: "Workflow finished. PR: {pr_url}"
   - If in progress: "Workflow running. Phase: {current_phase}"
   - If failed: "Workflow failed. Check logs: automation/logs/{adw_id}/"
```

#### Task 2.3: Update `.claude/agents/do-router.md`

Add to Intent Categories table:

```markdown
| `adw_workflow` | `workflow`, `adw`, `#\d+.*full`, `orchestrate` | `/do/adw` |
```

Add to Classification Algorithm:

```
Boosts:
  +0.3 for "workflow" keyword
  +0.25 for "full" + issue number
  +0.2 for "adw" or "orchestrate"
```

### Phase 3: Real-Time Token Streaming

#### Task 3.1: Create `automation/adws/adw_modules/token_streaming.py`

```python
"""Real-time token usage streaming for ADW workflows."""

from __future__ import annotations

import json
import sys
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TokenEvent(BaseModel):
    """Token usage event emitted during workflow execution."""
    
    adw_id: str = Field(..., description="ADW execution ID")
    phase: str = Field(..., description="Phase name (plan, build, review)")
    agent: str = Field(..., description="Agent name")
    input_tokens: int = Field(..., description="Prompt tokens consumed")
    output_tokens: int = Field(..., description="Completion tokens generated")
    cache_read_tokens: int = Field(default=0, description="Cached prompt tokens read")
    cache_creation_tokens: int = Field(default=0, description="Tokens written to cache")
    cost_usd: float = Field(..., description="Calculated cost in USD")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat(), description="ISO 8601 timestamp")


# Pricing constants (as of 2025-12-13)
PRICE_INPUT_PER_MILLION = 3.00
PRICE_OUTPUT_PER_MILLION = 15.00
PRICE_CACHE_WRITE_PER_MILLION = 3.75
PRICE_CACHE_READ_PER_MILLION = 0.30


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> float:
    """Calculate total cost in USD for token usage.
    
    Args:
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        cache_read_tokens: Number of cached tokens read
        cache_creation_tokens: Number of tokens written to cache
        
    Returns:
        Total cost in USD
    """
    cost = (
        (input_tokens * PRICE_INPUT_PER_MILLION / 1_000_000) +
        (output_tokens * PRICE_OUTPUT_PER_MILLION / 1_000_000) +
        (cache_read_tokens * PRICE_CACHE_READ_PER_MILLION / 1_000_000) +
        (cache_creation_tokens * PRICE_CACHE_WRITE_PER_MILLION / 1_000_000)
    )
    return round(cost, 6)


def emit_token_event(
    adw_id: str,
    phase: str,
    agent: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> None:
    """Emit a token event to stdout as JSON line.
    
    Args:
        adw_id: ADW execution ID
        phase: Phase name
        agent: Agent name
        input_tokens: Input token count
        output_tokens: Output token count
        cache_read_tokens: Cache read token count
        cache_creation_tokens: Cache creation token count
    """
    cost = calculate_cost(input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
    
    event = TokenEvent(
        adw_id=adw_id,
        phase=phase,
        agent=agent,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_creation_tokens=cache_creation_tokens,
        cost_usd=cost,
    )
    
    # Emit as JSON line to stdout
    sys.stdout.write(f"TOKEN_EVENT:{event.model_dump_json()}\n")
    sys.stdout.flush()


def parse_token_usage_from_result(result_message: dict) -> Optional[dict]:
    """Parse token usage from Claude Code result message.
    
    Args:
        result_message: Result message dict from parse_jsonl_output
        
    Returns:
        Dict with input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens
        or None if usage data not found
    """
    # Claude Code result messages include token usage in API response metadata
    # Format varies by SDK version, handle multiple formats
    usage = result_message.get("usage") or result_message.get("token_usage")
    if not usage:
        return None
    
    return {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_read_tokens": usage.get("cache_read_input_tokens", 0),
        "cache_creation_tokens": usage.get("cache_creation_input_tokens", 0),
    }


__all__ = [
    "TokenEvent",
    "calculate_cost",
    "emit_token_event",
    "parse_token_usage_from_result",
    "PRICE_INPUT_PER_MILLION",
    "PRICE_OUTPUT_PER_MILLION",
    "PRICE_CACHE_READ_PER_MILLION",
    "PRICE_CACHE_WRITE_PER_MILLION",
]
```

#### Task 3.2: Update `automation/adws/adw_modules/agent.py`

Add streaming support to `prompt_claude_code()`:

```python
def prompt_claude_code_streaming(
    request: AgentPromptRequest,
    stream_tokens: bool = False,
) -> AgentPromptResponse:
    """Execute Claude Code with optional real-time token streaming.
    
    Args:
        request: Prompt request configuration
        stream_tokens: If True, emit TokenEvent JSON lines to stdout
        
    Returns:
        AgentPromptResponse with output and token usage
    """
    from .token_streaming import emit_token_event, parse_token_usage_from_result
    
    response = prompt_claude_code(request)
    
    if stream_tokens and response.success:
        # Parse result message for token usage
        messages, result_message = parse_jsonl_output(request.output_file)
        if result_message:
            token_usage = parse_token_usage_from_result(result_message)
            if token_usage:
                emit_token_event(
                    adw_id=request.adw_id,
                    phase=request.agent_name.split("_")[0],  # Extract phase from agent name
                    agent=request.agent_name,
                    **token_usage,
                )
    
    return response
```

#### Task 3.3: Update `automation/adws/adw_agents/orchestrator.py`

Add `--stream-tokens` flag to CLI:

```python
def run_adw_workflow(
    issue_number: str,
    logger: logging.Logger,
    adw_id: Optional[str] = None,
    stream_tokens: bool = False,  # NEW PARAMETER
) -> WorkflowResult:
    """Run the full ADW workflow using atomic agents.
    
    Args:
        issue_number: GitHub issue number to process
        logger: Logger instance for tracking
        adw_id: Optional ADW execution ID (will be generated if not provided)
        stream_tokens: If True, emit TokenEvent JSON lines during execution
        
    Returns:
        WorkflowResult with execution outcome
    """
    # ... existing setup ...
    
    # Step 1: Classify issue (with retry and streaming)
    logger.info("Step 1: Classifying issue")
    def classify_with_state():
        # Pass stream_tokens to agent invocation
        return classify_issue(issue, adw_id, logger, stream_tokens=stream_tokens)
    
    # ... continue for all agents ...
```

Update each atomic agent to accept `stream_tokens` parameter and pass to `prompt_claude_code_streaming()`.

### Phase 4: Unified Observability

#### Task 4.1: Create `.claude/utils/adw-state-reader.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface ADWState {
  adw_id: string;
  issue_number?: string;
  branch_name?: string;
  plan_file?: string;
  issue_class?: string;
  worktree_name?: string;
  worktree_path?: string;
  worktree_created_at?: string;
  test_project_name?: string;
  pr_created?: boolean;
  auto_merge_enabled?: boolean;
  merge_status?: string;
  merge_timestamp?: number;
  extra?: Record<string, any>;
}

export function readADWState(adwId: string): ADWState | null {
  const statePath = path.join(
    process.cwd(),
    'automation',
    'agents',
    adwId,
    'adw_state.json'
  );

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as ADWState;
  } catch (error) {
    process.stderr.write(`Error reading ADW state: ${error}\n`);
    return null;
  }
}

export function listADWWorkflows(): string[] {
  const agentsDir = path.join(process.cwd(), 'automation', 'agents');

  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir).filter(dir => {
    const statePath = path.join(agentsDir, dir, 'adw_state.json');
    return fs.existsSync(statePath);
  });
}
```

#### Task 4.2: Create Observability Symlink

```bash
# In project root
mkdir -p .claude/data
ln -s ../../automation/logs/kota-db-ts .claude/data/adw_logs
```

Document in `.claude/commands/do.md`:

```markdown
## Observability

ADW logs are accessible at:
- Symlink: `.claude/data/adw_logs/`
- Actual path: `automation/logs/kota-db-ts/`

Structure:
```
.claude/data/adw_logs/
  {env}/
    {adw_id}/
      {agent_name}/
        raw_output.jsonl
        raw_output.json
        prompts/
          {command_name}.txt
```

## Validation Commands

```bash
# TypeScript linting and type-checking
cd app && bun run lint
cd app && bunx tsc --noEmit

# Python linting
cd automation && uv run ruff check adws/

# Unit tests
cd automation && uv run pytest adws/adw_tests/test_token_streaming.py -v
cd automation && uv run pytest adws/adw_tests/test_do_integration.py -v

# Integration test (manual)
/do #518 workflow
# Wait for completion
/do/status {adw_id}
```

## Issue Relationships

- **Depends on**: #517 (ADW atomic agent signature fixes) - RESOLVED
- **Related to**: `/do` universal entry point implementation
- **Related to**: ADW observability and metrics tracking
- **Enables**: Real-time workflow monitoring from Claude Code
- **Enables**: Unified workflow interface across Python and TypeScript

## Success Criteria

1. `/do #123 workflow` successfully triggers Python ADW orchestrator
2. Token events streamed to stdout in real-time (JSON lines)
3. `/do/status {adw_id}` returns valid state from Python state file
4. Intent router classifies "run workflow" with >0.8 confidence
5. Symlink created and logs accessible from `.claude/data/adw_logs/`
6. Total cost calculation accurate to 4 decimal places
7. No blocking during Python subprocess execution
8. Error messages clear when Python environment missing

## Future Enhancements

- **Workflow cancellation**: `/do/cancel {adw_id}` to terminate running workflow
- **Progress streaming**: Real-time phase updates beyond token events
- **Web dashboard**: TypeScript web UI consuming ADW state files
- **Webhook integration**: Trigger `/do/adw` from GitHub webhooks
- **Multi-issue batch**: `/do workflow --batch #123,#124,#125`
