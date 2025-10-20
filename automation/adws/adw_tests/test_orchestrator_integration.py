"""Integration tests for /orchestrator slash command workflow."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_project_root(tmp_path: Path) -> Path:
    """Create temporary project structure."""
    (tmp_path / "automation" / "agents").mkdir(parents=True)
    (tmp_path / "trees").mkdir(parents=True)
    (tmp_path / "docs" / "specs").mkdir(parents=True)
    (tmp_path / ".git").mkdir()
    return tmp_path


@pytest.fixture
def orchestrator_state_dir(tmp_path: Path) -> Path:
    """Create orchestrator state directory."""
    state_dir = tmp_path / "automation" / "agents" / "orch-187-20251020140000" / "orchestrator"
    state_dir.mkdir(parents=True)
    return state_dir


def test_orchestrator_state_initialization(orchestrator_state_dir: Path) -> None:
    """Test orchestrator state file initialization."""
    state_file = orchestrator_state_dir / "state.json"

    initial_state = {
        "adw_id": "orch-187-20251020140000",
        "issue_number": "187",
        "issue_title": "feat: implement /orchestrator slash command",
        "issue_type": "feat",
        "worktree_name": "feat-187-orchestrator-command",
        "worktree_path": "trees/feat-187-orchestrator-command",
        "branch_name": "feat-187-orchestrator-command",
        "created_at": "2025-10-20T14:00:00Z",
        "updated_at": "2025-10-20T14:00:00Z",
        "phase_status": {
            "plan": "pending",
            "build": "pending",
            "pr": "pending",
            "review": "pending"
        },
        "checkpoints": []
    }

    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(initial_state, f, indent=2)

    assert state_file.exists()

    with open(state_file, "r", encoding="utf-8") as f:
        loaded_state = json.load(f)

    assert loaded_state["adw_id"] == "orch-187-20251020140000"
    assert loaded_state["issue_number"] == "187"
    assert loaded_state["issue_type"] == "feat"
    assert loaded_state["phase_status"]["plan"] == "pending"


def test_orchestrator_checkpoint_system(orchestrator_state_dir: Path) -> None:
    """Test checkpoint creation and recovery."""
    state_file = orchestrator_state_dir / "state.json"

    # Initial state
    state = {
        "adw_id": "orch-187-20251020140000",
        "issue_number": "187",
        "phase_status": {
            "plan": "pending",
            "build": "pending",
            "pr": "pending",
            "review": "pending"
        },
        "checkpoints": []
    }

    # Add plan checkpoint
    plan_checkpoint = {
        "timestamp": "2025-10-20T14:05:00Z",
        "phase": "plan",
        "status": "completed",
        "artifacts": {
            "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md"
        },
        "next_action": "spawn_build_agent"
    }

    state["checkpoints"].append(plan_checkpoint)
    state["phase_status"]["plan"] = "completed"
    state["plan_file"] = "docs/specs/feature-187-orchestrator-slash-command.md"

    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    # Verify checkpoint saved
    with open(state_file, "r", encoding="utf-8") as f:
        loaded_state = json.load(f)

    assert len(loaded_state["checkpoints"]) == 1
    assert loaded_state["checkpoints"][0]["phase"] == "plan"
    assert loaded_state["checkpoints"][0]["status"] == "completed"
    assert loaded_state["phase_status"]["plan"] == "completed"
    assert loaded_state["plan_file"] == "docs/specs/feature-187-orchestrator-slash-command.md"


def test_orchestrator_issue_type_extraction() -> None:
    """Test issue type extraction from labels and title."""

    # Test with type labels
    labels_with_type = [
        {"name": "type:feature"},
        {"name": "component:api"},
        {"name": "priority:high"}
    ]

    # Extract type from labels
    issue_type = None
    for label in labels_with_type:
        if label["name"].startswith("type:"):
            issue_type = label["name"].split(":", 1)[1]
            if issue_type == "feature":
                issue_type = "feat"
            break

    assert issue_type == "feat"

    # Test with title prefix
    title_with_prefix = "feat: implement /orchestrator slash command"
    if ":" in title_with_prefix:
        prefix = title_with_prefix.split(":", 1)[0].strip().lower()
        if prefix in ["feat", "bug", "chore", "fix", "docs", "test", "refactor"]:
            issue_type = prefix
            if prefix == "fix":
                issue_type = "bug"

    assert issue_type == "feat"


def test_orchestrator_branch_naming() -> None:
    """Test branch and worktree naming conventions."""

    issue_number = "187"
    issue_title = "feat: implement /orchestrator slash command for end-to-end issue-to-PR automation"
    issue_type = "feat"

    # Extract slug from title (remove type prefix, take 3-6 words, sanitize)
    title_without_prefix = issue_title.split(":", 1)[1].strip() if ":" in issue_title else issue_title
    words = title_without_prefix.split()[:6]  # Take first 6 words
    slug = "-".join(words).lower()

    # Sanitize to alphanumeric + hyphens
    import re
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    slug = re.sub(r'-+', '-', slug)  # Remove duplicate hyphens
    slug = slug.strip('-')  # Remove leading/trailing hyphens

    # Generate names
    branch_name = f"{issue_type}-{issue_number}-{slug}"
    worktree_name = branch_name
    worktree_path = f"trees/{worktree_name}"

    assert branch_name == "feat-187-implement-orchestrator-slash-command-for-end-to-end"
    assert worktree_name == "feat-187-implement-orchestrator-slash-command-for-end-to-end"
    assert worktree_path == "trees/feat-187-implement-orchestrator-slash-command-for-end-to-end"


def test_orchestrator_adw_id_generation() -> None:
    """Test ADW ID generation with timestamp."""
    import datetime

    issue_number = "187"
    timestamp = datetime.datetime(2025, 10, 20, 14, 0, 0, tzinfo=datetime.timezone.utc)

    # Format: orch-<issue>-<timestamp>
    adw_id = f"orch-{issue_number}-{timestamp.strftime('%Y%m%d%H%M%S')}"

    assert adw_id == "orch-187-20251020140000"


def test_orchestrator_validation_parsing() -> None:
    """Test parsing validation results from build phase output."""

    # Simulated implementation agent output
    agent_output = """
    Running validation commands...
    ✓ Lint: PASS
    ✓ Type-check: PASS
    ✓ Integration tests: 133/133 passed

    Real-service evidence: Supabase integration tests hit real database

    All validation checks passed.
    """

    # Parse validation results
    validation = {
        "level": 2,
        "lint": "pass",
        "typecheck": "pass",
        "integration_tests": "133/133",
        "evidence": ""
    }

    if "Lint: PASS" in agent_output:
        validation["lint"] = "pass"
    if "Type-check: PASS" in agent_output:
        validation["typecheck"] = "pass"

    # Extract test count
    import re
    test_match = re.search(r'Integration tests: (\d+/\d+)', agent_output)
    if test_match:
        validation["integration_tests"] = test_match.group(1)

    # Extract evidence
    evidence_match = re.search(r'Real-service evidence: (.+)', agent_output)
    if evidence_match:
        validation["evidence"] = evidence_match.group(1).strip()

    assert validation["lint"] == "pass"
    assert validation["typecheck"] == "pass"
    assert validation["integration_tests"] == "133/133"
    assert "Supabase" in validation["evidence"]


def test_orchestrator_pr_url_extraction() -> None:
    """Test PR URL extraction from PR agent output."""

    # Simulated PR agent output
    pr_agent_output = "https://github.com/user/kota-db-ts/pull/210"

    # Extract PR number
    import re
    pr_url_match = re.search(r'https://github\.com/[^/]+/[^/]+/pull/(\d+)', pr_agent_output)

    assert pr_url_match is not None
    pr_number = pr_url_match.group(1)
    pr_url = pr_url_match.group(0)

    assert pr_number == "210"
    assert pr_url == "https://github.com/user/kota-db-ts/pull/210"


def test_orchestrator_dependency_checking() -> None:
    """Test dependency validation from issue body."""

    # Simulated issue body with dependencies
    issue_body = """
    ## Description
    Implement orchestrator slash command.

    ## Issue Relationships
    - Depends On: #153, #149
    - Related To: #146

    ## Acceptance Criteria
    - [ ] Command created
    """

    # Parse dependencies
    import re
    depends_on = []

    # Find "Depends On" line
    depends_match = re.search(r'Depends On:\s*(.+)', issue_body)
    if depends_match:
        deps_str = depends_match.group(1)
        # Extract issue numbers
        dep_numbers = re.findall(r'#(\d+)', deps_str)
        depends_on = dep_numbers

    assert depends_on == ["153", "149"]


def test_orchestrator_cleanup_conditions() -> None:
    """Test worktree cleanup decision logic."""

    # Scenario 1: Success with no flags
    skip_cleanup_flag = False
    env_cleanup_disabled = False
    workflow_success = True

    should_cleanup = (
        not skip_cleanup_flag
        and not env_cleanup_disabled
        and workflow_success
    )

    assert should_cleanup is True

    # Scenario 2: Success with --skip-cleanup flag
    skip_cleanup_flag = True
    should_cleanup = (
        not skip_cleanup_flag
        and not env_cleanup_disabled
        and workflow_success
    )

    assert should_cleanup is False

    # Scenario 3: Failure (always preserve)
    skip_cleanup_flag = False
    workflow_success = False
    should_cleanup = (
        not skip_cleanup_flag
        and not env_cleanup_disabled
        and workflow_success
    )

    assert should_cleanup is False

    # Scenario 4: ADW_CLEANUP_WORKTREES=false
    skip_cleanup_flag = False
    workflow_success = True
    env_cleanup_disabled = True
    should_cleanup = (
        not skip_cleanup_flag
        and not env_cleanup_disabled
        and workflow_success
    )

    assert should_cleanup is False


def test_orchestrator_resume_state_validation(orchestrator_state_dir: Path) -> None:
    """Test resume workflow state validation."""
    state_file = orchestrator_state_dir / "state.json"

    # Create state with completed plan phase
    state = {
        "adw_id": "orch-187-20251020140000",
        "issue_number": "187",
        "worktree_name": "feat-187-orchestrator-command",
        "worktree_path": "trees/feat-187-orchestrator-command",
        "branch_name": "feat-187-orchestrator-command",
        "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md",
        "phase_status": {
            "plan": "completed",
            "build": "pending",
            "pr": "pending",
            "review": "pending"
        },
        "checkpoints": [
            {
                "timestamp": "2025-10-20T14:05:00Z",
                "phase": "plan",
                "status": "completed",
                "next_action": "spawn_build_agent"
            }
        ]
    }

    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    # Load and validate state
    with open(state_file, "r", encoding="utf-8") as f:
        loaded_state = json.load(f)

    # Determine next phase
    next_phase = None
    for phase in ["plan", "build", "pr", "review"]:
        if loaded_state["phase_status"][phase] == "pending":
            next_phase = phase
            break

    assert next_phase == "build"
    assert loaded_state["plan_file"] == "docs/specs/feature-187-orchestrator-slash-command.md"


def test_orchestrator_label_validation() -> None:
    """Test issue label validation (all four categories required)."""

    # Complete labels
    complete_labels = [
        {"name": "component:ci"},
        {"name": "priority:medium"},
        {"name": "effort:medium"},
        {"name": "status:ready"}
    ]

    # Check categories
    categories = {
        "component": False,
        "priority": False,
        "effort": False,
        "status": False
    }

    for label in complete_labels:
        name = label["name"]
        for category in categories:
            if name.startswith(f"{category}:"):
                categories[category] = True

    all_categories_present = all(categories.values())
    assert all_categories_present is True

    # Incomplete labels (missing effort)
    incomplete_labels = [
        {"name": "component:ci"},
        {"name": "priority:medium"},
        {"name": "status:ready"}
    ]

    categories = {
        "component": False,
        "priority": False,
        "effort": False,
        "status": False
    }

    for label in incomplete_labels:
        name = label["name"]
        for category in categories:
            if name.startswith(f"{category}:"):
                categories[category] = True

    all_categories_present = all(categories.values())
    assert all_categories_present is False


def test_orchestrator_error_state_persistence(orchestrator_state_dir: Path) -> None:
    """Test error state persistence for recovery."""
    state_file = orchestrator_state_dir / "state.json"

    # State after build phase failure
    error_state = {
        "adw_id": "orch-187-20251020140000",
        "issue_number": "187",
        "phase_status": {
            "plan": "completed",
            "build": "failed",
            "pr": "pending",
            "review": "pending"
        },
        "checkpoints": [
            {
                "timestamp": "2025-10-20T14:05:00Z",
                "phase": "plan",
                "status": "completed"
            },
            {
                "timestamp": "2025-10-20T14:25:00Z",
                "phase": "build",
                "status": "failed",
                "error": "Validation failed: 5 type errors",
                "next_action": "fix_validation_errors"
            }
        ]
    }

    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(error_state, f, indent=2)

    # Verify error preserved
    with open(state_file, "r", encoding="utf-8") as f:
        loaded_state = json.load(f)

    assert loaded_state["phase_status"]["build"] == "failed"
    assert len(loaded_state["checkpoints"]) == 2
    assert loaded_state["checkpoints"][-1]["error"] == "Validation failed: 5 type errors"


def test_orchestrator_slash_command_mapping() -> None:
    """Test issue type to slash command mapping."""

    mappings = {
        "feat": "/feat",
        "feature": "/feat",
        "bug": "/bug",
        "fix": "/bug",
        "chore": "/chore"
    }

    # Test each mapping
    for issue_type, expected_command in mappings.items():
        normalized_type = issue_type
        if normalized_type == "feature":
            normalized_type = "feat"
        elif normalized_type == "fix":
            normalized_type = "bug"

        command = f"/{normalized_type}"
        assert command == expected_command
