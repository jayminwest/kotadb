"""Tests for checkpoint save/load functionality."""

from __future__ import annotations

import json
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from adws.adw_modules.data_types import CheckpointData, CheckpointFile
from adws.adw_modules.workflow_ops import load_checkpoint, save_checkpoint


@pytest.fixture
def temp_adw_dir(tmp_path):
    """Create temporary ADW directory structure."""
    # Mimic the structure: agents/{adw_id}/run_logs/...
    adw_id = "test_adw_123"
    adw_dir = tmp_path / "agents" / adw_id
    run_logs_dir = adw_dir / "run_logs" / "test_phase"
    run_logs_dir.mkdir(parents=True)
    return adw_dir, adw_id


def test_save_checkpoint_creates_file(temp_adw_dir, monkeypatch):
    """Test that save_checkpoint creates a checkpoint file."""
    adw_dir, adw_id = temp_adw_dir

    # Mock run_logs_dir to return our temp directory
    def mock_run_logs_dir(adw_id_arg):
        return adw_dir / "run_logs" / "test_phase"

    monkeypatch.setattr("adws.adw_modules.utils.run_logs_dir", mock_run_logs_dir)

    checkpoint_data = CheckpointData(
        timestamp=datetime.now().isoformat(),
        step="implementation",
        files_completed=["src/api/routes.ts"],
        next_action="commit_changes",
    )

    save_checkpoint(adw_id, "build", checkpoint_data)

    # Checkpoint is saved to {run_logs_parent}/{phase}/checkpoints.json
    # So: run_logs_dir().parent / phase = (adw_dir / "run_logs" / "test_phase").parent / "build" = adw_dir / "run_logs" / "build"
    checkpoint_file_path = adw_dir / "run_logs" / "build" / "checkpoints.json"
    assert checkpoint_file_path.exists()

    # Verify file content
    with open(checkpoint_file_path, "r") as f:
        data = json.load(f)

    assert data["phase"] == "build"
    assert len(data["checkpoints"]) == 1
    assert data["checkpoints"][0]["step"] == "implementation"


def test_save_multiple_checkpoints_appends(temp_adw_dir, monkeypatch):
    """Test that multiple save_checkpoint calls append to the same file."""
    adw_dir, adw_id = temp_adw_dir

    def mock_run_logs_dir(adw_id_arg):
        return adw_dir / "run_logs" / "test_phase"

    monkeypatch.setattr("adws.adw_modules.utils.run_logs_dir", mock_run_logs_dir)

    checkpoint1 = CheckpointData(
        timestamp=datetime.now().isoformat(),
        step="planning",
        files_completed=[],
        next_action="implementation",
    )

    checkpoint2 = CheckpointData(
        timestamp=datetime.now().isoformat(),
        step="implementation",
        files_completed=["src/api/routes.ts"],
        next_action="testing",
    )

    save_checkpoint(adw_id, "build", checkpoint1)
    save_checkpoint(adw_id, "build", checkpoint2)

    checkpoint_file = load_checkpoint(adw_id, "build")
    assert checkpoint_file is not None
    assert len(checkpoint_file.checkpoints) == 2
    assert checkpoint_file.checkpoints[0].step == "planning"
    assert checkpoint_file.checkpoints[1].step == "implementation"


def test_load_checkpoint_returns_none_when_missing(temp_adw_dir, monkeypatch):
    """Test that load_checkpoint returns None when no checkpoint file exists."""
    adw_dir, adw_id = temp_adw_dir

    def mock_run_logs_dir(adw_id_arg):
        return adw_dir / "run_logs" / "test_phase"

    monkeypatch.setattr("adws.adw_modules.utils.run_logs_dir", mock_run_logs_dir)

    result = load_checkpoint(adw_id, "build")
    assert result is None


def test_load_checkpoint_returns_checkpointfile(temp_adw_dir, monkeypatch):
    """Test that load_checkpoint returns CheckpointFile with valid data."""
    adw_dir, adw_id = temp_adw_dir

    def mock_run_logs_dir(adw_id_arg):
        return adw_dir / "run_logs" / "test_phase"

    monkeypatch.setattr("adws.adw_modules.utils.run_logs_dir", mock_run_logs_dir)

    checkpoint_data = CheckpointData(
        timestamp=datetime.now().isoformat(),
        step="review",
        files_completed=["docs/spec.md"],
        next_action="pr_creation",
        metadata={"review_status": "passed"},
    )

    save_checkpoint(adw_id, "review", checkpoint_data)

    result = load_checkpoint(adw_id, "review")
    assert result is not None
    assert result.phase == "review"
    assert len(result.checkpoints) == 1
    assert result.checkpoints[0].step == "review"
    assert result.checkpoints[0].metadata["review_status"] == "passed"


def test_save_checkpoint_atomic_write(temp_adw_dir, monkeypatch):
    """Test that save_checkpoint uses atomic write (temp file + rename)."""
    adw_dir, adw_id = temp_adw_dir

    def mock_run_logs_dir(adw_id_arg):
        return adw_dir / "run_logs" / "test_phase"

    monkeypatch.setattr("adws.adw_modules.utils.run_logs_dir", mock_run_logs_dir)

    checkpoint_data = CheckpointData(
        timestamp=datetime.now().isoformat(),
        step="testing",
        files_completed=[],
        next_action="validation",
    )

    save_checkpoint(adw_id, "build", checkpoint_data)

    # Temp file should not exist after successful write
    checkpoint_dir = adw_dir / "run_logs" / "build"
    temp_files = list(checkpoint_dir.glob("*.tmp"))
    assert len(temp_files) == 0

    # Final file should exist
    checkpoint_file_path = checkpoint_dir / "checkpoints.json"
    assert checkpoint_file_path.exists()


def test_load_checkpoint_handles_corrupt_json(temp_adw_dir, monkeypatch):
    """Test that load_checkpoint returns None on corrupt JSON."""
    adw_dir, adw_id = temp_adw_dir

    def mock_run_logs_dir(adw_id_arg):
        return adw_dir / "run_logs" / "test_phase"

    monkeypatch.setattr("adws.adw_modules.utils.run_logs_dir", mock_run_logs_dir)

    # Create corrupt checkpoint file
    checkpoint_dir = adw_dir / "run_logs" / "build"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_file_path = checkpoint_dir / "checkpoints.json"

    with open(checkpoint_file_path, "w") as f:
        f.write("{invalid json content")

    result = load_checkpoint(adw_id, "build")
    assert result is None


def test_checkpoint_data_with_metadata():
    """Test CheckpointData can store arbitrary metadata."""
    checkpoint = CheckpointData(
        timestamp="2025-10-17T12:00:00Z",
        step="implementation",
        files_completed=["src/a.ts", "src/b.ts"],
        next_action="testing",
        metadata={
            "commit_hash": "abc123",
            "validation_passed": True,
            "error_count": 0,
        },
    )

    assert checkpoint.metadata["commit_hash"] == "abc123"
    assert checkpoint.metadata["validation_passed"] is True
    assert checkpoint.metadata["error_count"] == 0


def test_checkpoint_file_serialization():
    """Test CheckpointFile can be serialized to JSON."""
    checkpoint_file = CheckpointFile(
        phase="plan",
        checkpoints=[
            CheckpointData(
                timestamp="2025-10-17T12:00:00Z",
                step="classification",
                files_completed=[],
                next_action="planning",
            ),
            CheckpointData(
                timestamp="2025-10-17T12:05:00Z",
                step="planning",
                files_completed=["docs/specs/feature-123.md"],
                next_action="validation",
            ),
        ],
    )

    serialized = checkpoint_file.model_dump(mode="json")
    assert serialized["phase"] == "plan"
    assert len(serialized["checkpoints"]) == 2
    assert serialized["checkpoints"][0]["step"] == "classification"

    # Verify can deserialize back
    deserialized = CheckpointFile(**serialized)
    assert deserialized.phase == "plan"
    assert len(deserialized.checkpoints) == 2
