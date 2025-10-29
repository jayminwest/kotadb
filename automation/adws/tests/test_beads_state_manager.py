"""Unit tests for BeadsStateManager class.

Tests CRUD operations, retry logic, and error handling for database-backed
ADW state persistence.
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
from pathlib import Path
from unittest import mock

import pytest

from adws.adw_modules.state import BeadsStateManager


@pytest.fixture
def temp_db():
    """Create temporary SQLite database with ADW schema."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)

    # Create tables
    conn = sqlite3.connect(db_path)
    try:
        # Enable foreign key constraints
        conn.execute("PRAGMA foreign_keys = ON")
        cursor = conn.cursor()

        # Create minimal issues table for foreign key
        cursor.execute("""
            CREATE TABLE issues (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT DEFAULT 'open'
            )
        """)

        # Create ADW tables
        cursor.execute("""
            CREATE TABLE adw_executions (
                id TEXT PRIMARY KEY,
                issue_id TEXT,
                phase TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                error_message TEXT,
                worktree_name TEXT,
                worktree_path TEXT,
                branch_name TEXT,
                pr_created BOOLEAN DEFAULT 0,
                test_project_name TEXT,
                extra_data TEXT,
                FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE adw_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                checkpoint_name TEXT NOT NULL,
                checkpoint_data TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (execution_id) REFERENCES adw_executions(id) ON DELETE CASCADE
            )
        """)

        conn.commit()
    finally:
        conn.close()

    yield db_path

    # Cleanup (use missing_ok=True for tests that delete/modify the database)
    if db_path.exists():
        if db_path.is_dir():
            db_path.rmdir()
        else:
            db_path.unlink()


def test_init_with_custom_db_path(temp_db):
    """Test BeadsStateManager initialization with custom database path."""
    manager = BeadsStateManager(db_path=temp_db)
    assert manager.db_path == temp_db
    assert manager.check_health()


def test_init_with_missing_db():
    """Test BeadsStateManager raises error for missing database."""
    fake_path = Path("/nonexistent/beads.db")
    with pytest.raises(FileNotFoundError, match="Beads database not found"):
        BeadsStateManager(db_path=fake_path)


def test_create_execution_minimal(temp_db):
    """Test creating execution with minimal required fields."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-123", phase="plan")

    # Verify record created
    exec_data = manager.get_execution("test-123")
    assert exec_data is not None
    assert exec_data["id"] == "test-123"
    assert exec_data["phase"] == "plan"
    assert exec_data["status"] == "pending"


def test_create_execution_with_all_fields(temp_db):
    """Test creating execution with all optional fields."""
    # Create test issue first
    conn = sqlite3.connect(temp_db)
    conn.execute("INSERT INTO issues (id, title) VALUES (?, ?)", ("kota-123", "Test Issue"))
    conn.commit()
    conn.close()

    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(
        adw_id="test-456",
        phase="build",
        issue_id="kota-123",
        status="in_progress",
        worktree_name="trees/test-branch",
        worktree_path="/path/to/worktree",
        branch_name="feat/test",
        extra_data={"custom_field": "value"},
    )

    exec_data = manager.get_execution("test-456")
    assert exec_data["issue_id"] == "kota-123"
    assert exec_data["status"] == "in_progress"
    assert exec_data["worktree_name"] == "trees/test-branch"
    assert exec_data["branch_name"] == "feat/test"
    assert exec_data["extra_data"] == {"custom_field": "value"}


def test_create_execution_duplicate_id(temp_db):
    """Test creating execution with duplicate ID raises error."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-789", phase="plan")

    with pytest.raises(sqlite3.IntegrityError):
        manager.create_execution(adw_id="test-789", phase="plan")


def test_update_execution_status_completed(temp_db):
    """Test updating execution status to completed sets completion timestamp."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-abc", phase="plan")

    manager.update_execution_status("test-abc", "completed")

    exec_data = manager.get_execution("test-abc")
    assert exec_data["status"] == "completed"
    assert exec_data["completed_at"] is not None


def test_update_execution_status_with_error(temp_db):
    """Test updating execution status to failed with error message."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-def", phase="build")

    manager.update_execution_status(
        "test-def", "failed", error_message="Build failed: tests did not pass"
    )

    exec_data = manager.get_execution("test-def")
    assert exec_data["status"] == "failed"
    assert exec_data["error_message"] == "Build failed: tests did not pass"
    assert exec_data["completed_at"] is not None


def test_update_execution_phase(temp_db):
    """Test updating execution phase."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-ghi", phase="plan")

    manager.update_execution_status("test-ghi", "completed", phase="build")

    exec_data = manager.get_execution("test-ghi")
    assert exec_data["phase"] == "build"
    assert exec_data["status"] == "completed"


def test_update_execution_not_found(temp_db):
    """Test updating nonexistent execution raises error."""
    manager = BeadsStateManager(db_path=temp_db)

    with pytest.raises(ValueError, match="not found"):
        manager.update_execution_status("nonexistent", "completed")


def test_save_checkpoint(temp_db):
    """Test saving checkpoint data."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-jkl", phase="plan")

    checkpoint_data = {"step": "validation", "files": ["plan.md"], "status": "pending"}
    manager.save_checkpoint("test-jkl", "plan", "pre_validation", checkpoint_data)

    # Load checkpoint
    loaded = manager.load_checkpoint("test-jkl", "pre_validation")
    assert loaded == checkpoint_data


def test_load_checkpoint_not_found(temp_db):
    """Test loading nonexistent checkpoint returns None."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-mno", phase="plan")

    loaded = manager.load_checkpoint("test-mno", "nonexistent")
    assert loaded is None


def test_save_checkpoint_without_execution(temp_db):
    """Test saving checkpoint for nonexistent execution raises foreign key error."""
    manager = BeadsStateManager(db_path=temp_db)

    with pytest.raises(sqlite3.IntegrityError):
        manager.save_checkpoint("nonexistent", "plan", "test", {"data": "value"})


def test_checkpoint_with_complex_data(temp_db):
    """Test checkpoint can store complex nested data structures."""
    manager = BeadsStateManager(db_path=temp_db)
    manager.create_execution(adw_id="test-pqr", phase="build")

    complex_data = {
        "nested": {"level": 2, "items": [1, 2, 3]},
        "array": ["a", "b", "c"],
        "boolean": True,
        "null_value": None,
    }

    manager.save_checkpoint("test-pqr", "build", "complex_test", complex_data)
    loaded = manager.load_checkpoint("test-pqr", "complex_test")

    assert loaded == complex_data


def test_retry_on_database_lock(temp_db):
    """Test retry logic on database lock errors."""
    manager = BeadsStateManager(db_path=temp_db)

    # Mock the _get_connection to simulate lock on first call
    original_get_conn = manager._get_connection
    call_count = {"count": 0}

    def mock_get_conn_with_lock():
        call_count["count"] += 1
        if call_count["count"] == 1:
            raise sqlite3.OperationalError("database is locked")
        return original_get_conn()

    with mock.patch.object(manager, "_get_connection", side_effect=mock_get_conn_with_lock):
        # This should succeed after retry
        manager.create_execution(adw_id="test-retry", phase="plan")

    # Verify retry happened
    assert call_count["count"] == 2

    # Verify execution was created
    exec_data = manager.get_execution("test-retry")
    assert exec_data is not None


def test_get_execution_not_found(temp_db):
    """Test get_execution returns None for nonexistent execution."""
    manager = BeadsStateManager(db_path=temp_db)
    result = manager.get_execution("nonexistent")
    assert result is None


def test_check_health_success(temp_db):
    """Test database health check returns True for healthy database."""
    manager = BeadsStateManager(db_path=temp_db)
    assert manager.check_health() is True


def test_check_health_failure(temp_db):
    """Test database health check returns False when database becomes inaccessible."""
    # Create manager with valid database
    manager = BeadsStateManager(db_path=temp_db)
    assert manager.check_health() is True

    # Replace database file with a directory to prevent SQLite from creating/accessing it
    temp_db.unlink()
    temp_db.mkdir()

    # Health check should now fail (can't connect to a directory)
    assert manager.check_health() is False
