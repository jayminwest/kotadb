# KotaDB ADWs Architecture Specification: Home Server Integration

**Version**: 1.0
**Date**: 2025-10-11
**Status**: Design Specification
**Author**: Architecture Planning

---

## Executive Summary

This document specifies the complete architecture for integrating KotaDB's AI Developer Workflows (ADWs) with a custom home server task management system. The integration enables automated code development triggered by tasks from a home server endpoint, replacing GitHub issue-based triggers with a more flexible task orchestration system.

**Key Components**:
- Home server task API (Tailscale-secured endpoint)
- KotaDB ADWs trigger system (polling-based)
- Git worktree-based parallel execution
- Claude Code agent orchestration
- Status synchronization between systems

---

## Table of Contents

1. [Layer 1: ADWs (AI Developer Workflows)](#layer-1-adws)
2. [Layer 2: Templates](#layer-2-templates)
3. [Layer 3: Plans](#layer-3-plans)
4. [Layer 4: Architecture](#layer-4-architecture)
5. [Layer 5: Tests](#layer-5-tests)
6. [Layer 6: Docs](#layer-6-docs)
7. [Layer 7: Types](#layer-7-types)
8. [Layer 8: Standard Out](#layer-8-standard-out)
9. [Layer 9: Tools](#layer-9-tools)
10. [Layer 10: Prompt](#layer-10-prompt)
11. [Layer 11: Model](#layer-11-model)
12. [Layer 12: Context](#layer-12-context)
13. [Output Artifacts](#output-artifacts)
14. [Dependencies & Prerequisites](#dependencies--prerequisites)
15. [Execution Flow Summary](#execution-flow-summary)

---

## Layer 1: ADWs (AI Developer Workflows)
**Location**: `adws/`

### Primary Trigger Script
**File**: `adws/adw_triggers/adw_trigger_cron_homeserver.py`

**Responsibilities**:
- Poll home server endpoint at configurable intervals (default: 15 seconds)
- Fetch eligible tasks (status: `pending`)
- Claim tasks immediately (update to `claimed` status)
- Generate worktree names (if not provided)
- Create worktrees (if they don't exist)
- Delegate to workflow scripts based on task complexity
- Track execution state and statistics
- Handle errors and update task status to `failed` if needed

**Configuration**:
```python
class HomeServerCronConfig(BaseModel):
    polling_interval: int = 15  # seconds
    home_server_url: str = "https://jaymins-mac-pro.tail1b7f44.ts.net"
    tasks_endpoint: str = "/api/tasks/kotadb"
    dry_run: bool = False
    max_concurrent_tasks: int = 3
    worktree_base_path: str = "trees"
    status_filter: List[str] = ["pending"]
```

**Task Manager Class**:
```python
class HomeServerTaskManager:
    def __init__(self, base_url: str, tasks_endpoint: str)
    def get_eligible_tasks(status_filter: List[str], limit: int) -> List[HomeServerTask]
    def claim_task(task_id: str, adw_id: str) -> bool
    def complete_task(task_id: str, result: dict) -> bool
    def fail_task(task_id: str, error: str) -> bool
    def generate_worktree_name(task_description: str, prefix: str) -> Optional[str]
```

**Trigger Class**:
```python
class HomeServerCronTrigger:
    def __init__(self, config: HomeServerCronConfig)
    def check_worktree_exists(worktree_name: str) -> bool
    def create_worktree(worktree_name: str) -> bool
    def delegate_task(task: HomeServerTask, worktree_name: str, adw_id: str)
    def process_tasks()  # Main polling loop
    def create_status_display() -> Panel
    def run_once()  # Single check
    def run_continuous()  # Continuous polling
```

**Statistics Tracking**:
```python
stats = {
    "checks": 0,
    "tasks_started": 0,
    "worktrees_created": 0,
    "homeserver_updates": 0,
    "errors": 0,
    "last_check": None,
}
```

### Workflow Scripts (Delegation Targets)
**Files**:
- `adws/adw_build_update_homeserver_task.py` (simple workflow)
- `adws/adw_plan_implement_update_homeserver_task.py` (complex workflow)

**Responsibilities**:
- Accept CLI arguments: `--adw-id`, `--worktree-name`, `--task`, `--task-id`, `--model`
- Execute within worktree context
- Call appropriate templates (`/build` or `/plan` + `/implement`)
- Update home server task status on completion/failure
- Generate workflow summary JSON
- Use TAC's timestamped panel UI for status updates

**Simple Workflow Flow**:
1. Phase 1: `/build` (direct implementation)
2. Phase 2: Update home server task status

**Complex Workflow Flow**:
1. Phase 1: `/plan` (create implementation plan)
2. Phase 2: `/implement` (execute plan)
3. Phase 3: Update home server task status

---

## Layer 2: Templates
**Location**: `.claude/commands/`

### Required Slash Commands

#### `/get_homeserver_tasks`
**Purpose**: Fetch eligible tasks from home server
**Template**: `.claude/commands/get_homeserver_tasks.md`
**Arguments**: `$1` (base_url), `$2` (status_filter_json), `$3` (limit)
**Expected Output**: JSON array of task objects
**Tools Required**: `WebFetch` or equivalent HTTP tool

#### `/update_homeserver_task`
**Purpose**: Update task status on home server
**Template**: `.claude/commands/update_homeserver_task.md`
**Arguments**: `$1` (task_id), `$2` (status), `$3` (update_content_json)
**Expected Output**: Success confirmation message
**Tools Required**: `WebFetch` or equivalent HTTP tool

#### `/make_worktree_name`
**Purpose**: Generate a valid git worktree name from task description
**Template**: `.claude/commands/make_worktree_name.md`
**Arguments**: `$1` (task_description), `$2` (prefix - optional)
**Expected Output**: Single-line worktree name (e.g., `feat-rate-limiting`)
**Rules**:
- Kebab-case format
- Max 50 characters
- Only alphanumeric and hyphens
- Must be valid git branch name

#### `/init_worktree`
**Purpose**: Create a new git worktree with sparse checkout
**Template**: `.claude/commands/init_worktree.md`
**Arguments**: `$1` (worktree_name), `$2` (target_directory - optional)
**Expected Output**: Success message with worktree path
**Tools Required**: `Bash` for git operations

#### `/build`
**Purpose**: Direct implementation without planning phase
**Template**: `.claude/commands/build.md`
**Arguments**: `$1` (adw_id), `$2` (task_description)
**Expected Output**: Implementation summary with commit hash
**Use Case**: Simple tasks (typo fixes, logging, minor refactors)

#### `/plan`
**Purpose**: Create detailed implementation plan
**Template**: `.claude/commands/plan.md`
**Arguments**: `$1` (adw_id), `$2` (task_description)
**Expected Output**: Plan file path (e.g., `specs/plan-abc123.md`)
**Use Case**: Complex tasks requiring architecture decisions

#### `/implement`
**Purpose**: Execute an existing implementation plan
**Template**: `.claude/commands/implement.md`
**Arguments**: `$1` (plan_file_path)
**Expected Output**: Implementation summary with commit hash
**Use Case**: Follow-up to `/plan` phase

---

## Layer 3: Plans
**Location**: `specs/`

### Plan File Structure
**Naming**: `specs/plan-{adw_id}.md`
**Generated By**: `/plan` template
**Consumed By**: `/implement` template

**Contents**:
```markdown
# Implementation Plan: {task_title}

**ADW ID**: {adw_id}
**Created**: {timestamp}
**Worktree**: {worktree_name}

## Objective
{What needs to be accomplished}

## Current State
{Current codebase state relevant to this task}

## Proposed Changes

### 1. {Component/File Name}
- **Action**: {create/modify/delete}
- **Rationale**: {Why this change}
- **Details**: {Specific implementation notes}

### 2. {Next Component}
...

## Testing Strategy
{How to validate the changes}

## Rollback Plan
{How to revert if needed}

## Dependencies
{Any external dependencies or blockers}
```

---

## Layer 4: Architecture
**Location**: `adws/adw_modules/`

### Core Modules

#### `data_types.py`
**Purpose**: Pydantic models for all data structures
**Contents**:
```python
class HomeServerTask(BaseModel):
    task_id: str
    title: str
    description: str
    status: Literal["pending", "claimed", "in_progress", "completed", "failed"]
    priority: Optional[str] = None
    tags: Dict[str, str] = {}
    worktree: Optional[str] = None
    model: Optional[str] = None
    workflow_type: Optional[str] = None
    created_at: str
    claimed_at: Optional[str] = None
    completed_at: Optional[str] = None
    adw_id: Optional[str] = None
    result: Optional[Dict] = None
    error: Optional[str] = None

    def is_eligible_for_processing(self) -> bool
    def get_preferred_model(self) -> str  # Returns "sonnet" or "opus"
    def should_use_full_workflow(self) -> bool  # Returns True for complex workflow

class HomeServerCronConfig(BaseModel):
    # (as defined in Layer 1)

class HomeServerTaskUpdate(BaseModel):
    status: str
    adw_id: Optional[str]
    worktree: Optional[str]
    commit_hash: Optional[str]
    error: Optional[str]
    timestamp: str
```

#### `agent.py` (Enhanced from TAC)
**Purpose**: Claude Code CLI wrapper with retry logic
**Key Functions**:
```python
# Already exists from TAC, needs no changes:
def prompt_claude_code_with_retry(request, max_retries=3, retry_delays=[1,3,5])
def prompt_claude_code(request: AgentPromptRequest) -> AgentPromptResponse
def execute_template(request: AgentTemplateRequest) -> AgentPromptResponse
def get_safe_subprocess_env() -> Dict[str, str]
def truncate_output(output: str, max_length=500) -> str
def save_prompt(prompt: str, adw_id: str, agent_name: str)
```

#### `utils.py`
**Purpose**: Shared utilities and formatting helpers
**Key Functions**:
```python
# Existing from TAC:
def format_agent_status(...)
def format_worktree_status(...)

# New for home server:
def build_homeserver_url(base_url: str, endpoint: str) -> str
def parse_json(output: str, expected_type: type) -> Any
```

#### `git_ops.py` (Optional, if needed)
**Purpose**: Git operations for worktree management
**Key Functions**:
```python
def create_worktree(worktree_name: str, base_path: str, target_dir: str) -> bool
def delete_worktree(worktree_name: str, base_path: str) -> bool
def get_current_commit_hash(working_dir: str) -> Optional[str]
def worktree_exists(worktree_name: str, base_path: str) -> bool
```

---

## Layer 5: Tests
**Location**: `adws/adw_tests/`

### Test Files

#### `test_homeserver_trigger.py`
**Purpose**: Test home server task fetching and delegation
**Test Cases**:
```python
def test_homeserver_task_manager_get_tasks()
def test_homeserver_task_manager_claim_task()
def test_homeserver_task_manager_complete_task()
def test_homeserver_task_manager_fail_task()
def test_homeserver_cron_trigger_check_worktree_exists()
def test_homeserver_cron_trigger_delegate_task_simple()
def test_homeserver_cron_trigger_delegate_task_complex()
def test_homeserver_cron_trigger_process_tasks()
```

#### `test_homeserver_workflows.py`
**Purpose**: Test workflow script execution
**Test Cases**:
```python
def test_build_update_homeserver_task_simple()
def test_plan_implement_update_homeserver_task_complex()
def test_workflow_handles_missing_worktree()
def test_workflow_updates_task_on_failure()
```

### Test Strategy
- Mock home server HTTP responses using `responses` library or similar
- Use temporary directories for worktree operations
- Validate JSON output structures
- Ensure proper error handling and status updates

---

## Layer 6: Docs
**Location**: `adws/README.md` updates

### Documentation Updates Required

#### Section: "Home Server Integration"
```markdown
## Home Server Integration

KotaDB ADWs can be triggered from a custom home server endpoint via Tailscale.

### Setup

1. Configure home server URL:
   ```bash
   export HOMESERVER_URL="https://jaymins-mac-pro.tail1b7f44.ts.net"
   export HOMESERVER_TASKS_ENDPOINT="/api/tasks/kotadb"
   ```

2. Start the cron trigger:
   ```bash
   uv run adws/adw_triggers/adw_trigger_cron_homeserver.py
   ```

### Task Structure

Tasks from the home server must include:
- `task_id`: Unique identifier
- `title`: Short description
- `description`: Detailed task description
- `status`: Current status (pending/claimed/in_progress/completed/failed)
- `tags`: Optional metadata (model, workflow, worktree)

### Workflow Routing

- Simple tasks (typos, logging): Use `/build` workflow
- Complex tasks (features, refactors): Use `/plan` → `/implement` workflow
- Specify in `tags.workflow`: "simple" or "complex"

### Worktree Management

Each task runs in an isolated git worktree at `trees/{worktree_name}/`.
Worktree names are auto-generated from task titles if not provided.
```

---

## Layer 7: Types
**Location**: `adws/adw_modules/data_types.py`

### Type Definitions (Comprehensive)

```python
from typing import Literal, Optional, Dict, List, Any
from pydantic import BaseModel, Field, validator
from datetime import datetime
from enum import Enum

class TaskStatus(str, Enum):
    """Valid task statuses for home server tasks."""
    PENDING = "pending"
    CLAIMED = "claimed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class WorkflowType(str, Enum):
    """Workflow complexity types."""
    SIMPLE = "simple"      # /build only
    COMPLEX = "complex"    # /plan + /implement

class ModelType(str, Enum):
    """Claude model selection."""
    SONNET = "sonnet"
    OPUS = "opus"

class HomeServerTask(BaseModel):
    """Task fetched from home server endpoint."""
    task_id: str = Field(..., description="Unique task identifier")
    title: str = Field(..., description="Short task title")
    description: str = Field(..., description="Detailed task description")
    status: TaskStatus = Field(default=TaskStatus.PENDING)
    priority: Optional[str] = Field(None, description="Priority level (low/medium/high)")
    tags: Dict[str, str] = Field(default_factory=dict, description="Metadata tags")
    worktree: Optional[str] = Field(None, description="Target worktree name")
    model: Optional[ModelType] = Field(None, description="Preferred Claude model")
    workflow_type: Optional[WorkflowType] = Field(None, description="Workflow complexity")
    created_at: str = Field(..., description="ISO timestamp of creation")
    claimed_at: Optional[str] = Field(None, description="ISO timestamp when claimed")
    completed_at: Optional[str] = Field(None, description="ISO timestamp when completed")
    adw_id: Optional[str] = Field(None, description="ADW execution ID")
    result: Optional[Dict[str, Any]] = Field(None, description="Execution result data")
    error: Optional[str] = Field(None, description="Error message if failed")

    def is_eligible_for_processing(self) -> bool:
        """Check if task can be picked up."""
        return self.status == TaskStatus.PENDING

    def get_preferred_model(self) -> ModelType:
        """Extract model preference from tags or default to sonnet."""
        if self.model:
            return self.model
        model_tag = self.tags.get("model", "sonnet")
        return ModelType.OPUS if model_tag == "opus" else ModelType.SONNET

    def should_use_full_workflow(self) -> bool:
        """Determine if complex workflow (plan+implement) is needed."""
        if self.workflow_type:
            return self.workflow_type == WorkflowType.COMPLEX
        workflow_tag = self.tags.get("workflow", "simple")
        return workflow_tag == "complex"

class HomeServerTaskUpdate(BaseModel):
    """Update payload sent to home server."""
    status: TaskStatus = Field(..., description="New task status")
    adw_id: Optional[str] = Field(None, description="ADW execution ID")
    worktree: Optional[str] = Field(None, description="Worktree name used")
    commit_hash: Optional[str] = Field(None, description="Git commit hash if successful")
    error: Optional[str] = Field(None, description="Error message if failed")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class HomeServerCronConfig(BaseModel):
    """Configuration for home server cron trigger."""
    polling_interval: int = Field(default=15, ge=1, description="Polling interval in seconds")
    home_server_url: str = Field(..., description="Base URL of home server")
    tasks_endpoint: str = Field(default="/api/tasks/kotadb", description="Tasks API endpoint")
    dry_run: bool = Field(default=False, description="Run without making changes")
    max_concurrent_tasks: int = Field(default=3, ge=1, description="Max parallel tasks")
    worktree_base_path: str = Field(default="trees", description="Base path for worktrees")
    status_filter: List[TaskStatus] = Field(
        default=[TaskStatus.PENDING],
        description="Task statuses to fetch"
    )
```

---

## Layer 8: Standard Out (Console Output)
**Location**: All workflow scripts

### Output Format

#### Panel-Based Status Updates (from TAC)
```python
def print_status_panel(
    console: Console,
    action: str,
    adw_id: str,
    worktree: str,
    phase: Optional[str] = None,
    status: str = "info"
):
    """
    Print timestamped status panel.

    Example output:
    ┌─[14:23:45] | abc123 | feat-rate-limit | build─────────────────┐
    │ 🔄 Starting build process                                      │
    └─────────────────────────────────────────────────────────────────┘
    """
    timestamp = datetime.now().strftime("%H:%M:%S")

    # Icon selection
    icon = {
        "success": "✅",
        "error": "❌",
        "info": "🔄"
    }.get(status, "ℹ️")

    # Border color
    border_style = {
        "success": "green",
        "error": "red",
        "info": "cyan"
    }.get(status, "blue")

    # Build title
    title_parts = [f"[{timestamp}]", adw_id[:6], worktree]
    if phase:
        title_parts.append(phase)
    title = " | ".join(title_parts)

    console.print(Panel(
        f"{icon} {action}",
        title=f"[bold {border_style}]{title}[/bold {border_style}]",
        border_style=border_style,
        padding=(0, 1)
    ))
```

#### Summary Tables
```python
# Workflow summary at completion
summary_table = Table(show_header=True, box=None)
summary_table.add_column("Phase", style="bold cyan")
summary_table.add_column("Status", style="bold")
summary_table.add_column("Output Directory", style="dim")

summary_table.add_row(
    "Build (/build)",
    "✅ Success" if success else "❌ Failed",
    f"./agents/{adw_id}/{agent_name}/"
)
```

#### Statistics Display (Trigger)
```python
# Cron trigger status display
table = Table(show_header=False, box=None)
table.add_column(style="bold cyan")
table.add_column()

table.add_row("Status", "[green]Running[/green]")
table.add_row("Polling Interval", "15 seconds")
table.add_row("Home Server", "jaymins-mac-pro.tail1b7f44.ts.net")
table.add_row("Tasks Started", "12")
table.add_row("Errors", "0")

console.print(Panel(
    Align.center(table),
    title="[bold blue]🔄 Home Server Multi-Agent Cron[/bold blue]",
    border_style="blue"
))
```

---

## Layer 9: Tools
**Location**: Available to Claude Code during template execution

### Required Tools

#### WebFetch (HTTP Requests)
**Purpose**: Fetch and update tasks from home server
**Usage in Templates**:
```markdown
Use the WebFetch tool to fetch tasks:
- URL: {base_url}{endpoint}?status=pending&limit={limit}
- Method: GET
- Expected Response: JSON array of tasks
```

#### Bash (Git Operations)
**Purpose**: Create worktrees, commit changes, get commit hashes
**Usage in Templates**:
```markdown
Use the Bash tool to:
1. Create worktree: `git worktree add trees/{name} -b {name}`
2. Get commit hash: `git rev-parse HEAD`
3. Check worktree exists: `ls trees/{name}`
```

#### Read/Write/Edit (File Operations)
**Purpose**: Read plans, write code, edit files
**Usage in Templates**:
```markdown
Use Read to load the plan from {plan_path}
Use Edit to modify existing files
Use Write only for new files
```

#### Glob/Grep (Search)
**Purpose**: Find files and search code patterns
**Usage in Templates**:
```markdown
Use Glob to find relevant files: "**/*.ts"
Use Grep to search for patterns: "export.*function"
```

---

## Layer 10: Prompt (Template Content)
**Location**: `.claude/commands/*.md`

### Prompt Engineering Principles

#### 1. Clear Objective
```markdown
You are tasked with {specific action}. Your goal is to {outcome}.
```

#### 2. Context Provision
```markdown
**Context:**
- ADW ID: $1
- Task Description: $2
- Worktree: You are working in trees/{worktree}/kota-db-ts/
- Project: KotaDB - HTTP API for code indexing (Bun + TypeScript + Supabase)
```

#### 3. Constraints
```markdown
**Constraints:**
- ONLY use the tools available to you (no manual editing)
- Commit all changes with descriptive messages
- Follow the existing code style and patterns
- Update tests if modifying functionality
```

#### 4. Expected Output
```markdown
**Expected Output:**
Return ONLY the {specific format}, nothing else.
Example: specs/plan-abc123.md
```

#### 5. Error Handling
```markdown
**Error Handling:**
If you encounter errors:
1. Document the error clearly
2. Attempt recovery if possible
3. Return failure status if unrecoverable
```

### Example Template: `/get_homeserver_tasks`
```markdown
You are tasked with fetching eligible tasks from the home server API.

**Inputs:**
- Base URL: $1 (e.g., https://jaymins-mac-pro.tail1b7f44.ts.net)
- Status Filter: $2 (JSON array of statuses to fetch)
- Limit: $3 (maximum number of tasks to fetch)

**Instructions:**
1. Use the WebFetch tool to make a GET request to: {base_url}/api/tasks/kotadb
2. Include query parameters: status={status_filter}&limit={limit}
3. Parse the JSON response
4. Validate each task has required fields: task_id, title, description, status

**Expected Response Format:**
Return a JSON array of task objects. Each task must have:
- task_id (string)
- title (string)
- description (string)
- status (string)
- tags (object, optional)
- created_at (ISO timestamp)

**Example Output:**
```json
[
  {
    "task_id": "task-001",
    "title": "Add rate limiting",
    "description": "Implement tier-based rate limiting...",
    "status": "pending",
    "tags": {"model": "sonnet", "workflow": "complex"},
    "created_at": "2025-10-11T14:30:00Z"
  }
]
```

**Error Handling:**
If the request fails, return an empty array [] and log the error.
```

---

## Layer 11: Model
**Location**: Configuration and execution

### Model Selection Strategy

#### Default: Sonnet
**Use Cases**:
- Simple tasks (< 5 file changes)
- Quick fixes and refactors
- Documentation updates
- Cost-sensitive operations

**Configuration**:
```python
model = task.get_preferred_model()  # Returns "sonnet" by default
```

#### Override: Opus
**Use Cases**:
- Complex architectural changes
- Multi-file refactors (> 10 files)
- Ambiguous requirements
- Planning phases for large features

**Configuration**:
```python
# Via task tags
task.tags = {"model": "opus"}

# Via CLI flag
./adw_plan_implement_update_homeserver_task.py --model opus
```

#### Model Costs (Reference)
- Sonnet: ~$3 per 1M input tokens, $15 per 1M output tokens
- Opus: ~$15 per 1M input tokens, $75 per 1M output tokens

---

## Layer 12: Context
**Location**: All levels (project-wide awareness)

### Context Layers

#### 1. Repository Context (CLAUDE.md)
**Location**: `CLAUDE.md`
**Provides**:
- Project overview (KotaDB HTTP API service)
- Tech stack (Bun, TypeScript, Supabase)
- Development commands (`bun test`, `bunx tsc --noEmit`)
- Architecture (API layer, auth, database, indexer)
- Path aliases (`@api/*`, `@db/*`, etc.)
- Environment variables

**Injected**: Automatically by Claude Code (reads CLAUDE.md)

#### 2. Task Context (from Home Server)
**Provides**:
- Task title and description
- Tags and metadata
- Priority and status
- Historical context (previous attempts)

**Injected**: Via template arguments (`$1`, `$2`, etc.)

#### 3. Worktree Context
**Provides**:
- Current branch name
- Working directory isolation
- Git history and commits
- File system state

**Injected**: Via `working_dir` parameter in AgentPromptRequest

#### 4. ADW Context (Persistent State)
**Provides**:
- ADW ID for tracking
- Phase history (plan → build → test)
- Previous outputs and errors
- Session continuity

**Injected**: Via `adw_id` parameter and state files

#### 5. Execution Context (Environment)
**Provides**:
- Current timestamp
- Available tools (Read, Write, Bash, etc.)
- Model capabilities and limits
- Token budget

**Injected**: By Claude Code runtime

### Context Flow Example
```
Home Server Task
    ↓
[Task ID: task-001, Title: "Add rate limiting", Tags: {workflow: "complex"}]
    ↓
Trigger Script (adw_trigger_cron_homeserver.py)
    ↓
[ADW ID: abc12345, Worktree: feat-rate-limit, Model: sonnet]
    ↓
Workflow Script (adw_plan_implement_update_homeserver_task.py)
    ↓
[Phase: plan, Working Dir: trees/feat-rate-limit/kota-db-ts/]
    ↓
Template (/plan)
    ↓
[CLAUDE.md context + Task description + Current codebase state]
    ↓
Claude Code Agent Execution
    ↓
[Output: specs/plan-abc12345.md]
    ↓
Template (/implement)
    ↓
[Plan file content + CLAUDE.md context + Worktree state]
    ↓
Claude Code Agent Execution
    ↓
[Output: Code changes + Commit hash]
    ↓
Update Home Server (task completed)
```

---

## Output Artifacts

### File Structure After Execution
```
kota-db-ts/
├── adws/
│   ├── adw_triggers/
│   │   └── adw_trigger_cron_homeserver.py
│   ├── adw_build_update_homeserver_task.py
│   ├── adw_plan_implement_update_homeserver_task.py
│   └── adw_modules/
│       └── data_types.py  (updated with HomeServerTask models)
├── .claude/commands/
│   ├── get_homeserver_tasks.md
│   ├── update_homeserver_task.md
│   ├── make_worktree_name.md
│   ├── init_worktree.md
│   ├── build.md
│   ├── plan.md
│   └── implement.md
├── trees/
│   └── feat-rate-limit/
│       └── kota-db-ts/  (isolated worktree)
├── agents/
│   └── abc12345/  (ADW ID)
│       ├── homeserver-task-fetcher/
│       │   ├── cc_raw_output.jsonl
│       │   ├── cc_raw_output.json
│       │   └── prompts/get_homeserver_tasks.txt
│       ├── planner-feat-rate-limit/
│       │   ├── cc_raw_output.jsonl
│       │   └── prompts/plan.txt
│       ├── builder-feat-rate-limit/
│       │   ├── cc_raw_output.jsonl
│       │   └── prompts/implement.txt
│       └── workflow_summary.json
└── specs/
    └── plan-abc12345.md
```

---

## Dependencies & Prerequisites

### Python Packages (adws/adw_triggers/adw_trigger_cron_homeserver.py)
```python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pydantic",
#   "python-dotenv",
#   "click",
#   "rich",
#   "schedule",
#   "requests",  # For HTTP requests to home server
# ]
# ///
```

### Environment Variables
```bash
# .env or adws/.env
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_CODE_PATH=claude  # Default
HOMESERVER_URL=https://jaymins-mac-pro.tail1b7f44.ts.net
HOMESERVER_TASKS_ENDPOINT=/api/tasks/kotadb
```

### System Requirements
- Bun (for KotaDB project commands)
- Git (for worktree operations)
- Claude Code CLI (`claude`)
- uv (for script execution)
- Tailscale (for home server access)

---

## Execution Flow Summary

### Trigger Loop
```
1. Poll home server: GET /api/tasks/kotadb?status=pending&limit=3
2. For each task:
   a. Claim task: POST /api/tasks/kotadb/{task_id}/claim (status → claimed, set adw_id)
   b. Generate worktree name (if not provided)
   c. Create worktree (if doesn't exist)
   d. Spawn workflow script as detached subprocess:
      - Simple: adw_build_update_homeserver_task.py
      - Complex: adw_plan_implement_update_homeserver_task.py
3. Wait {polling_interval} seconds
4. Repeat
```

### Workflow Script Execution
```
1. Receive CLI args: --adw-id, --worktree-name, --task, --task-id, --model
2. Change to worktree directory
3. Execute phase(s):
   - Simple: /build
   - Complex: /plan → /implement
4. On success:
   - Get commit hash
   - POST /api/tasks/kotadb/{task_id}/complete (status → completed, add result)
5. On failure:
   - POST /api/tasks/kotadb/{task_id}/fail (status → failed, add error)
6. Generate workflow_summary.json
7. Exit with appropriate code
```

---

## Implementation Status

This specification is **complete and ready for implementation** on the KotaDB side. All 12 layers are defined:

1. ✅ **ADWs**: Trigger and workflow scripts specified
2. ✅ **Templates**: 7 slash commands detailed
3. ✅ **Plans**: File structure and content format defined
4. ✅ **Architecture**: Module layout and class structure
5. ✅ **Tests**: Test files and cases outlined
6. ✅ **Docs**: README updates specified
7. ✅ **Types**: Complete Pydantic models
8. ✅ **Standard Out**: Console output format (panels, tables, icons)
9. ✅ **Tools**: Claude Code tools and usage patterns
10. ✅ **Prompt**: Template engineering principles and examples
11. ✅ **Model**: Selection strategy (sonnet default, opus override)
12. ✅ **Context**: Multi-layer context injection flow

---

## Next Steps

1. **Implement KotaDB side** based on this specification
2. **Define home server API contract** (see companion document: `adws-homeserver-api-specification.md`)
3. **Test integration** with mock home server endpoints
4. **Deploy** to production environment

---

**End of Specification**
