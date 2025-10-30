"""Data models and command metadata for ADW automation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

CommandType = Literal["feature", "bug", "chore", "schema", "support"]


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


@dataclass(frozen=True)
class CommandMapping:
    trigger: str
    category: CommandType
    description: str


COMMAND_MAPPINGS: tuple[CommandMapping, ...] = (
    CommandMapping("/feature", "feature", "Feature development workflow"),
    CommandMapping("/bug", "bug", "Bug triage and fix"),
    CommandMapping("/chore", "chore", "Repository maintenance"),
    CommandMapping("/schema_plan", "schema", "Database migration planning"),
    CommandMapping("/bun_install", "support", "Dependency installation helper"),
)


def resolve_category(trigger: str) -> CommandType | None:
    """Return the command category for a slash command trigger."""

    for mapping in COMMAND_MAPPINGS:
        if mapping.trigger == trigger:
            return mapping.category
    return None


IssueClassSlashCommand = Literal["/chore", "/bug", "/feature"]

SlashCommand = Literal[
    "/chore",
    "/bug",
    "/feature",
    "/classify_issue",
    "/review",
    "/document",
    "/docs-update",
    "/patch",
    "/find_plan_file",
    "/generate_branch_name",
    "/commit",
    "/pull_request",
    "/implement",
    "/build",
    "/plan",
]


class GitHubUser(BaseModel):
    login: str
    id: Optional[str] = None
    name: Optional[str] = None
    is_bot: bool = Field(default=False, alias="is_bot")


class GitHubLabel(BaseModel):
    id: str
    name: str
    color: str
    description: Optional[str] = None


class GitHubMilestone(BaseModel):
    id: str
    number: int
    title: str
    description: Optional[str] = None
    state: str


class GitHubComment(BaseModel):
    id: str
    author: GitHubUser
    body: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")


class GitHubIssueListItem(BaseModel):
    """Subset of issue fields used for polling workflows."""

    model_config = ConfigDict(populate_by_name=True)

    number: int
    title: str
    body: str
    labels: List[GitHubLabel] = []
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class GitHubIssue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    number: int
    title: str
    body: str
    state: str
    author: GitHubUser
    assignees: List[GitHubUser] = []
    labels: List[GitHubLabel] = []
    milestone: Optional[GitHubMilestone] = None
    comments: List[GitHubComment] = []
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    closed_at: Optional[datetime] = Field(None, alias="closedAt")
    url: str


class AgentPromptRequest(BaseModel):
    prompt: str
    adw_id: str
    agent_name: str = "ops"
    model: Literal["sonnet", "opus"] = "sonnet"
    dangerously_skip_permissions: bool = False
    output_file: str
    slash_command: Optional[str] = None
    cwd: Optional[str] = None


class AgentPromptResponse(BaseModel):
    output: str
    success: bool
    session_id: Optional[str] = None
    retry_code: Optional[str] = None  # RetryCode enum value from agent.py


class AgentTemplateRequest(BaseModel):
    agent_name: str
    slash_command: SlashCommand
    args: List[str]
    adw_id: str
    model: Literal["sonnet", "opus"] = "sonnet"
    cwd: Optional[str] = None


class ClaudeCodeResultMessage(BaseModel):
    type: str
    subtype: str
    is_error: bool
    duration_ms: int
    duration_api_ms: int
    num_turns: int
    result: str
    session_id: str
    total_cost_usd: float


class TestResult(BaseModel):
    """Structured representation of a validation command outcome."""

    label: str
    passed: bool
    command: str
    stdout: Optional[str] = None
    stderr: Optional[str] = None


class ReviewIssue(BaseModel):
    """Individual issue reported during review."""

    review_issue_number: int
    issue_description: str
    issue_resolution: str
    issue_severity: Literal["skippable", "tech_debt", "blocker"] = "tech_debt"
    screenshot_path: Optional[str] = None
    screenshot_url: Optional[str] = None


class ReviewResult(BaseModel):
    """Aggregate review output from the reviewer agent."""

    success: bool
    review_summary: str
    review_issues: List[ReviewIssue] = []


class DocumentationResult(BaseModel):
    """Summary of documentation changes produced by the documenter agent."""

    success: bool
    documentation_created: bool = False
    documentation_path: Optional[str] = None
    summary: Optional[str] = None
    error_message: Optional[str] = None


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


class TriggerStatsReport(BaseModel):
    """Statistics report payload sent to home server."""
    trigger_id: str = Field(..., description="Unique trigger identifier")
    hostname: str = Field(..., description="Hostname where trigger is running")
    stats: Dict[str, Any] = Field(..., description="Statistics dictionary")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat(), description="ISO timestamp of report")


class HomeServerCronConfig(BaseModel):
    """Configuration for home server cron trigger."""
    polling_interval: int = Field(default=15, ge=1, description="Polling interval in seconds")
    home_server_url: str = Field(..., description="Base URL of home server")
    tasks_endpoint: str = Field(default="/api/kota-tasks", description="Tasks API endpoint")
    dry_run: bool = Field(default=False, description="Run without making changes")
    max_concurrent_tasks: int = Field(default=3, ge=1, description="Max parallel tasks")
    worktree_base_path: str = Field(default="automation/trees", description="Base path for worktrees")
    status_filter: List[TaskStatus] = Field(
        default=[TaskStatus.PENDING],
        description="Task statuses to fetch"
    )
    stats_reporting_enabled: bool = Field(default=True, description="Enable stats reporting to home server")
    stats_reporting_interval: int = Field(default=60, ge=10, description="Stats reporting interval in seconds (minimum 10)")
    stats_endpoint: str = Field(default="/api/kota-tasks/stats", description="Stats reporting endpoint")


class CheckpointData(BaseModel):
    """Individual checkpoint within a phase."""
    timestamp: str = Field(..., description="ISO timestamp when checkpoint was created")
    step: str = Field(..., description="Phase step identifier (e.g., 'implementation', 'commit')")
    files_completed: List[str] = Field(default_factory=list, description="List of files completed at this checkpoint")
    next_action: Optional[str] = Field(None, description="Next action to resume from this checkpoint")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional checkpoint-specific data")


class CheckpointFile(BaseModel):
    """Checkpoint file format for a phase."""
    phase: str = Field(..., description="Phase name (plan, build, review)")
    checkpoints: List[CheckpointData] = Field(default_factory=list, description="List of checkpoints in this phase")


class PhaseMetrics(BaseModel):
    """Execution metrics for a single ADW phase."""
    phase_name: str = Field(..., description="Phase identifier (adw_plan, adw_build, etc.)")
    start_timestamp: datetime = Field(..., description="Phase start time (ISO 8601)")
    end_timestamp: Optional[datetime] = Field(None, description="Phase end time (None if incomplete)")
    duration_seconds: Optional[float] = Field(None, description="Computed elapsed time")
    memory_usage_mb: Optional[float] = Field(None, description="Peak memory usage snapshot")
    checkpoint_count: int = Field(default=0, description="Number of checkpoints created")
    git_operation_count: int = Field(default=0, description="Number of git operations executed")
    git_operation_duration_seconds: Optional[float] = Field(None, description="Total time in git operations")
    agent_invocation_count: int = Field(default=0, description="Number of agent calls")
    agent_invocation_duration_seconds: Optional[float] = Field(None, description="Total time in agent calls")


class WorkflowMetrics(BaseModel):
    """Aggregate metrics for multi-phase workflow execution."""
    phases: List[PhaseMetrics] = Field(default_factory=list, description="Ordered list of phase metrics")
    total_duration_seconds: Optional[float] = Field(None, description="End-to-end workflow duration")
    workflow_type: str = Field(..., description="Workflow identifier (adw_sdlc, adw_plan_build, etc.)")


class BeadsIssue(BaseModel):
    """Beads issue data model."""
    id: str = Field(..., description="Beads issue ID (e.g., kota-db-ts-303)")
    title: str = Field(..., description="Issue title")
    description: str = Field(default="", description="Issue description")
    status: str = Field(..., description="Issue status (open, in_progress, blocked, closed)")
    priority: int = Field(..., description="Issue priority (1-5, where 1=highest)")
    issue_type: str = Field(default="task", description="Issue type (bug, feature, task, epic, chore)")
    assignee: Optional[str] = Field(None, description="Assigned user")
    external_ref: Optional[str] = Field(None, description="External reference (e.g., GitHub issue number)")
    labels: List[str] = Field(default_factory=list, description="Issue labels")
    dependencies: List[str] = Field(default_factory=list, description="Issue IDs this depends on")
    dependents: List[str] = Field(default_factory=list, description="Issue IDs that depend on this")


class BeadsSyncMetadata(BaseModel):
    """Metadata for beads sync state."""
    last_sync: str = Field(..., description="ISO timestamp of last beads sync")
    source: str = Field(..., description="Data source (beads or github)")
    beads_available: bool = Field(default=False, description="Whether beads MCP tools are available")


class ReproductionResult(BaseModel):
    """Result of bug reproduction phase."""
    steps_executed: List[str] = Field(default_factory=list, description="Reproduction steps executed")
    evidence_files: List[str] = Field(default_factory=list, description="Paths to evidence files")
    confirmed_at: str = Field(..., description="ISO timestamp when bug confirmed")
    success: bool = Field(..., description="Whether reproduction succeeded")
    error_message: Optional[str] = Field(None, description="Error message if reproduction failed")


class CIMonitoringResult(BaseModel):
    """Result of CI monitoring phase."""
    checks_passed: bool = Field(..., description="Whether all CI checks passed")
    retry_count: int = Field(default=0, description="Number of CI fix retry attempts")
    last_check_at: str = Field(..., description="ISO timestamp of last CI check")
    failing_checks: List[str] = Field(default_factory=list, description="Names of failing CI checks")


class AutoMergeResult(BaseModel):
    """Result of auto-merge phase."""
    eligible: bool = Field(..., description="Whether PR is eligible for auto-merge")
    merge_attempted: bool = Field(default=False, description="Whether merge was attempted")
    merge_result: Optional[str] = Field(None, description="Merge result message")


class SurgicalFixState(BaseModel):
    """State for surgical fix workflow."""
    model_config = ConfigDict(populate_by_name=True)

    surgical_fix_id: str = Field(..., description="Unique surgical fix identifier")
    issue_number: str = Field(..., description="GitHub issue number")
    issue_title: str = Field(..., description="GitHub issue title")
    worktree_path: Optional[str] = Field(None, description="Worktree path for isolated execution")
    branch_name: Optional[str] = Field(None, description="Git branch name")
    created_at: str = Field(..., description="ISO timestamp when workflow started")
    phase_status: Dict[str, str] = Field(default_factory=dict, description="Status of each phase")
    reproduction: Optional[ReproductionResult] = Field(None, description="Bug reproduction result")
    plan_file: Optional[str] = Field(None, description="Path to plan file")
    validation: Optional[Dict[str, Any]] = Field(None, description="Validation results")
    pr_number: Optional[str] = Field(None, description="GitHub PR number")
    pr_url: Optional[str] = Field(None, description="GitHub PR URL")
    ci_monitoring: Optional[CIMonitoringResult] = Field(None, description="CI monitoring result")
    auto_merge: Optional[AutoMergeResult] = Field(None, description="Auto-merge result")
    checkpoints: List[CheckpointData] = Field(default_factory=list, description="Workflow checkpoints")


__all__ = [
    "AgentPromptRequest",
    "AgentPromptResponse",
    "AgentTemplateRequest",
    "AutoMergeResult",
    "BeadsIssue",
    "BeadsSyncMetadata",
    "CheckpointData",
    "CheckpointFile",
    "CIMonitoringResult",
    "ClaudeCodeResultMessage",
    "CommandMapping",
    "CommandType",
    "COMMAND_MAPPINGS",
    "DocumentationResult",
    "GitHubComment",
    "GitHubIssue",
    "GitHubIssueListItem",
    "GitHubLabel",
    "GitHubMilestone",
    "GitHubUser",
    "HomeServerCronConfig",
    "HomeServerTask",
    "HomeServerTaskUpdate",
    "IssueClassSlashCommand",
    "ModelType",
    "PhaseMetrics",
    "ReproductionResult",
    "ReviewIssue",
    "ReviewResult",
    "SlashCommand",
    "SurgicalFixState",
    "TaskStatus",
    "TestResult",
    "TriggerStatsReport",
    "WorkflowMetrics",
    "WorkflowType",
    "resolve_category",
]
