"""Unit tests for surgical fix workflow."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, call, mock_open, patch

import pytest

from adw_modules.data_types import (
    AutoMergeResult,
    CheckpointData,
    CIMonitoringResult,
    ReproductionResult,
    SurgicalFixState,
)
from surgical_fix import (
    extract_plan_file_path,
    extract_pr_metadata,
    extract_reproduction_steps,
    extract_validation_results,
    generate_surgical_fix_id,
    load_surgical_fix_state,
    save_surgical_fix_state,
    validate_issue_labels,
    validate_plan_file,
)


class TestStateManagement:
    """Tests for state save/load operations."""

    def test_generate_surgical_fix_id(self):
        """Test surgical fix ID generation."""
        issue_number = "123"
        fix_id = generate_surgical_fix_id(issue_number)

        assert fix_id.startswith("fix-123-")
        assert len(fix_id) == len("fix-123-20251029120000")
        # Verify timestamp format
        timestamp_part = fix_id.split("-")[2]
        assert timestamp_part.isdigit()
        assert len(timestamp_part) == 14  # YYYYMMDDHHmmss

    @patch("surgical_fix.SURGICAL_FIX_STATE_DIR", Path("/tmp/test_agents"))
    def test_save_surgical_fix_state(self, tmp_path):
        """Test atomic state save."""
        state = SurgicalFixState(
            surgical_fix_id="fix-123-test",
            issue_number="123",
            issue_title="Test Bug",
            created_at=datetime.now().isoformat(),
            phase_status={"plan": "completed"}
        )

        with patch("surgical_fix.SURGICAL_FIX_STATE_DIR", tmp_path):
            save_surgical_fix_state(state)

            # Verify state file exists
            state_file = tmp_path / "fix-123-test" / "surgical_fix_state.json"
            assert state_file.exists()

            # Verify content
            with open(state_file) as f:
                data = json.load(f)
            assert data["surgical_fix_id"] == "fix-123-test"
            assert data["issue_number"] == "123"
            assert data["phase_status"]["plan"] == "completed"

    @patch("surgical_fix.SURGICAL_FIX_STATE_DIR", Path("/tmp/test_agents"))
    def test_load_surgical_fix_state(self, tmp_path):
        """Test state loading and validation."""
        state_data = {
            "surgical_fix_id": "fix-456-test",
            "issue_number": "456",
            "issue_title": "Critical Bug",
            "created_at": "2025-10-29T12:00:00",
            "phase_status": {"implementation": "in_progress"}
        }

        state_dir = tmp_path / "fix-456-test"
        state_dir.mkdir(parents=True)
        state_file = state_dir / "surgical_fix_state.json"
        with open(state_file, "w") as f:
            json.dump(state_data, f)

        with patch("surgical_fix.SURGICAL_FIX_STATE_DIR", tmp_path):
            state = load_surgical_fix_state("fix-456-test")

        assert state.surgical_fix_id == "fix-456-test"
        assert state.issue_number == "456"
        assert state.phase_status["implementation"] == "in_progress"

    @patch("surgical_fix.SURGICAL_FIX_STATE_DIR", Path("/tmp/test_agents"))
    def test_load_surgical_fix_state_missing(self):
        """Test error handling for missing state file."""
        with patch("surgical_fix.SURGICAL_FIX_STATE_DIR", Path("/nonexistent")):
            with pytest.raises(FileNotFoundError, match="State file not found"):
                load_surgical_fix_state("fix-999-missing")

    @patch("surgical_fix.SURGICAL_FIX_STATE_DIR", Path("/tmp/test_agents"))
    def test_load_surgical_fix_state_invalid(self, tmp_path):
        """Test error handling for invalid state file."""
        state_dir = tmp_path / "fix-789-invalid"
        state_dir.mkdir(parents=True)
        state_file = state_dir / "surgical_fix_state.json"
        with open(state_file, "w") as f:
            f.write("invalid json{")

        with patch("surgical_fix.SURGICAL_FIX_STATE_DIR", tmp_path):
            with pytest.raises(ValueError, match="Invalid state file"):
                load_surgical_fix_state("fix-789-invalid")


class TestIssueValidation:
    """Tests for issue validation logic."""

    def test_validate_issue_labels_valid_critical(self):
        """Test validation with bug and priority:critical labels."""
        labels = [
            {"name": "bug"},
            {"name": "priority:critical"}
        ]

        is_valid, error = validate_issue_labels(labels)
        assert is_valid
        assert error is None

    def test_validate_issue_labels_valid_high(self):
        """Test validation with bug and priority:high labels."""
        labels = [
            {"name": "bug"},
            {"name": "priority:high"},
            {"name": "backend"}
        ]

        is_valid, error = validate_issue_labels(labels)
        assert is_valid
        assert error is None

    def test_validate_issue_labels_missing_bug(self):
        """Test validation fails without bug label."""
        labels = [{"name": "priority:critical"}]

        is_valid, error = validate_issue_labels(labels)
        assert not is_valid
        assert "bug" in error

    def test_validate_issue_labels_missing_priority(self):
        """Test validation fails without priority label."""
        labels = [{"name": "bug"}]

        is_valid, error = validate_issue_labels(labels)
        assert not is_valid
        assert "priority" in error

    def test_validate_issue_labels_wrong_priority(self):
        """Test validation fails with priority:medium."""
        labels = [
            {"name": "bug"},
            {"name": "priority:medium"}
        ]

        is_valid, error = validate_issue_labels(labels)
        assert not is_valid


class TestReproductionStepExtraction:
    """Tests for reproduction step parsing."""

    def test_extract_reproduction_steps_code_block(self):
        """Test extraction from markdown code block."""
        issue_body = """
        ## Description
        This is a bug

        ## Reproduction Steps
        ```bash
        curl -X POST /api/test
        bun test
        ```
        """

        steps = extract_reproduction_steps(issue_body)
        assert len(steps) == 2
        assert steps[0] == "curl -X POST /api/test"
        assert steps[1] == "bun test"

    def test_extract_reproduction_steps_plain_text(self):
        """Test extraction from plain text with $ prefix."""
        issue_body = """
        ## Reproduction Steps
        $ curl http://localhost:3000
        $ bun run dev
        """

        steps = extract_reproduction_steps(issue_body)
        assert len(steps) == 2
        assert steps[0] == "curl http://localhost:3000"
        assert steps[1] == "bun run dev"

    def test_extract_reproduction_steps_no_section(self):
        """Test extraction returns empty list when no section found."""
        issue_body = """
        ## Description
        No reproduction steps here
        """

        steps = extract_reproduction_steps(issue_body)
        assert steps == []

    def test_extract_reproduction_steps_empty_body(self):
        """Test extraction with empty issue body."""
        steps = extract_reproduction_steps("")
        assert steps == []

    def test_extract_reproduction_steps_case_insensitive(self):
        """Test extraction is case insensitive."""
        issue_body = """
        ## REPRODUCTION STEPS
        ```bash
        curl -X GET /api/status
        ```
        """

        steps = extract_reproduction_steps(issue_body)
        assert len(steps) == 1


class TestPlanFileHandling:
    """Tests for plan file operations."""

    def test_extract_plan_file_path_explicit(self):
        """Test extraction of explicit path from output."""
        output = """
        Created plan file: docs/specs/bug-123-auth-bypass.md
        """

        path = extract_plan_file_path(output, "123")
        assert path == "docs/specs/bug-123-auth-bypass.md"

    def test_extract_plan_file_path_with_markdown(self):
        """Test extraction with markdown formatting."""
        output = """
        Plan file: `docs/specs/bug-456-rate-limit.md`
        """

        with patch("surgical_fix.project_root", return_value=Path("/tmp/project")):
            with patch("pathlib.Path.exists", return_value=True):
                path = extract_plan_file_path(output, "456")
                assert "bug-456-rate-limit.md" in path

    def test_extract_plan_file_path_fallback_glob(self):
        """Test fallback to filesystem glob."""
        output = "No explicit path"

        with patch("surgical_fix.project_root", return_value=Path("/tmp/project")):
            specs_dir = Path("/tmp/project/docs/specs")
            with patch("pathlib.Path.exists", return_value=True):
                with patch("pathlib.Path.glob") as mock_glob:
                    mock_file = Path("/tmp/project/docs/specs/bug-789-test.md")
                    mock_glob.return_value = [mock_file]
                    with patch("pathlib.Path.stat") as mock_stat:
                        mock_stat.return_value.st_mtime = 123456

                        path = extract_plan_file_path(output, "789")
                        assert path == "docs/specs/bug-789-test.md"

    def test_extract_plan_file_path_not_found(self):
        """Test returns None when plan file not found."""
        output = "No plan file"

        with patch("surgical_fix.project_root", return_value=Path("/tmp/project")):
            with patch("pathlib.Path.exists", return_value=False):
                with patch("pathlib.Path.glob", return_value=[]):
                    path = extract_plan_file_path(output, "999")
                    assert path is None

    def test_validate_plan_file_valid(self, tmp_path):
        """Test validation passes with required sections."""
        plan_content = """
        # Bug Fix Plan

        ## Root Cause
        The bug is caused by...

        ## Fix Strategy
        We will fix it by...
        """

        plan_file = tmp_path / "bug-123-plan.md"
        plan_file.write_text(plan_content)

        with patch("surgical_fix.project_root", return_value=tmp_path):
            is_valid, error = validate_plan_file("bug-123-plan.md")

        assert is_valid
        assert error is None

    def test_validate_plan_file_missing_sections(self, tmp_path):
        """Test validation fails with missing sections."""
        plan_content = """
        # Bug Fix Plan

        ## Root Cause
        The bug is caused by...
        """

        plan_file = tmp_path / "bug-456-plan.md"
        plan_file.write_text(plan_content)

        with patch("surgical_fix.project_root", return_value=tmp_path):
            is_valid, error = validate_plan_file("bug-456-plan.md")

        assert not is_valid
        assert "Fix Strategy" in error

    def test_validate_plan_file_not_found(self):
        """Test validation fails for missing file."""
        with patch("surgical_fix.project_root", return_value=Path("/tmp")):
            is_valid, error = validate_plan_file("nonexistent.md")

        assert not is_valid
        assert "not found" in error


class TestValidationResultExtraction:
    """Tests for validation result parsing."""

    def test_extract_validation_results_level_2(self):
        """Test extraction of Level 2 validation results."""
        output = """
        Validation: Level 2 selected (feature with new endpoints)
        Commands executed: lint (pass), typecheck (pass), integration tests (pass, 133/133)
        """

        results = extract_validation_results(output)
        assert results["level"] == 2
        assert results["lint"] == "pass"
        assert results["typecheck"] == "pass"
        assert results["integration_tests"] == "133/133"

    def test_extract_validation_results_failures(self):
        """Test extraction with validation failures."""
        output = """
        Validation Level 2
        lint: fail
        typecheck: fail
        """

        results = extract_validation_results(output)
        assert results["level"] == 2
        assert results["lint"] == "fail"
        assert results["typecheck"] == "fail"

    def test_extract_validation_results_partial(self):
        """Test extraction with partial results."""
        output = """
        Validation Level 3
        lint passed
        """

        results = extract_validation_results(output)
        assert results["level"] == 3
        assert results["lint"] == "pass"
        assert results["typecheck"] == "unknown"

    def test_extract_validation_results_default(self):
        """Test extraction defaults to Level 2."""
        output = "No validation info"

        results = extract_validation_results(output)
        assert results["level"] == 2


class TestPRMetadataExtraction:
    """Tests for PR metadata parsing."""

    def test_extract_pr_metadata_from_url(self):
        """Test extraction from PR URL."""
        output = """
        Created PR: https://github.com/user/repo/pull/123
        """

        pr_number, pr_url = extract_pr_metadata(output, "test-branch")
        assert pr_number == "123"
        assert pr_url == "https://github.com/user/repo/pull/123"

    def test_extract_pr_metadata_from_number(self):
        """Test extraction from PR number with gh fallback."""
        output = "PR #456 created"

        with patch("subprocess.run") as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = '{"url": "https://github.com/user/repo/pull/456"}'

            pr_number, pr_url = extract_pr_metadata(output, "test-branch")
            assert pr_number == "456"
            assert pr_url == "https://github.com/user/repo/pull/456"

    def test_extract_pr_metadata_fallback_branch(self):
        """Test fallback to branch name lookup."""
        output = "PR created"

        with patch("subprocess.run") as mock_run:
            # First call (pr view) raises exception
            # Second call (pr list) succeeds
            mock_run.side_effect = [
                Exception("not found"),
                MagicMock(
                    returncode=0,
                    stdout='[{"number": 789, "url": "https://github.com/user/repo/pull/789"}]'
                )
            ]

            pr_number, pr_url = extract_pr_metadata(output, "test-branch")
            assert pr_number == "789"
            assert pr_url == "https://github.com/user/repo/pull/789"

    def test_extract_pr_metadata_not_found(self):
        """Test returns None when metadata not extractable."""
        output = "No PR info"

        with patch("subprocess.run", side_effect=Exception("gh error")):
            pr_number, pr_url = extract_pr_metadata(output, "test-branch")
            assert pr_number is None
            assert pr_url is None


class TestDataModels:
    """Tests for Pydantic data models."""

    def test_reproduction_result_valid(self):
        """Test ReproductionResult model validation."""
        result = ReproductionResult(
            steps_executed=["curl http://test", "bun test"],
            evidence_files=["/tmp/log.txt"],
            confirmed_at="2025-10-29T12:00:00",
            success=True
        )

        assert len(result.steps_executed) == 2
        assert result.success is True
        assert result.error_message is None

    def test_ci_monitoring_result_valid(self):
        """Test CIMonitoringResult model validation."""
        result = CIMonitoringResult(
            checks_passed=False,
            retry_count=1,
            last_check_at="2025-10-29T12:30:00",
            failing_checks=["test-integration", "lint"]
        )

        assert result.checks_passed is False
        assert result.retry_count == 1
        assert len(result.failing_checks) == 2

    def test_auto_merge_result_valid(self):
        """Test AutoMergeResult model validation."""
        result = AutoMergeResult(
            eligible=True,
            merge_attempted=True,
            merge_result="success"
        )

        assert result.eligible is True
        assert result.merge_result == "success"

    def test_surgical_fix_state_complete(self):
        """Test SurgicalFixState with all fields."""
        state = SurgicalFixState(
            surgical_fix_id="fix-123-test",
            issue_number="123",
            issue_title="Critical Bug",
            worktree_path="/tmp/worktree",
            branch_name="bug/123-fix",
            created_at="2025-10-29T12:00:00",
            phase_status={
                "reproduction": "completed",
                "plan": "completed",
                "implementation": "in_progress"
            },
            reproduction=ReproductionResult(
                steps_executed=["curl test"],
                evidence_files=["/tmp/log.txt"],
                confirmed_at="2025-10-29T12:05:00",
                success=True
            ),
            plan_file="docs/specs/bug-123-plan.md",
            validation={"level": 2, "lint": "pass"},
            checkpoints=[
                CheckpointData(
                    timestamp="2025-10-29T12:10:00",
                    step="reproduction_complete"
                )
            ]
        )

        assert state.surgical_fix_id == "fix-123-test"
        assert state.phase_status["implementation"] == "in_progress"
        assert state.reproduction.success is True
        assert len(state.checkpoints) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
