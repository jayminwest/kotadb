"""Data models and command metadata for ADW automation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

CommandType = Literal["feature", "bug", "chore", "schema", "support"]


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

    number: int
    title: str
    body: str
    labels: List[GitHubLabel] = []
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class GitHubIssue(BaseModel):
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

    class Config:
        populate_by_name = True


class AgentPromptRequest(BaseModel):
    prompt: str
    adw_id: str
    agent_name: str = "ops"
    model: Literal["sonnet", "opus"] = "sonnet"
    dangerously_skip_permissions: bool = False
    output_file: str
    slash_command: Optional[str] = None


class AgentPromptResponse(BaseModel):
    output: str
    success: bool
    session_id: Optional[str] = None


class AgentTemplateRequest(BaseModel):
    agent_name: str
    slash_command: SlashCommand
    args: List[str]
    adw_id: str
    model: Literal["sonnet", "opus"] = "sonnet"


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


__all__ = [
    "AgentPromptRequest",
    "AgentPromptResponse",
    "AgentTemplateRequest",
    "ClaudeCodeResultMessage",
    "CommandMapping",
    "CommandType",
    "COMMAND_MAPPINGS",
    "GitHubComment",
    "GitHubIssue",
    "GitHubIssueListItem",
    "GitHubLabel",
    "GitHubMilestone",
    "GitHubUser",
    "IssueClassSlashCommand",
    "SlashCommand",
    "TestResult",
    "ReviewIssue",
    "ReviewResult",
    "DocumentationResult",
    "resolve_category",
]
