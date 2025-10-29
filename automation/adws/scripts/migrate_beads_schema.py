#!/usr/bin/env python3
"""Migration runner for beads database schema extensions.

This script manages ADW-specific schema additions to the beads SQLite database.
Supports applying migrations, checking status, and rolling back changes.

Usage:
    python migrate_beads_schema.py --apply                  # Apply pending migrations
    python migrate_beads_schema.py --status                 # Show migration status
    python migrate_beads_schema.py --rollback --version 001 # Rollback specific version
    python migrate_beads_schema.py --db test.db --apply     # Use custom database path

Recovery steps if migration fails:
    1. Restore from backup: cp .beads/beads.db.backup .beads/beads.db
    2. Check migration logs for error details
    3. Fix migration SQL if needed
    4. Re-run with --apply flag
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Tuple


def get_db_path(custom_path: str | None = None) -> Path:
    """Get path to beads database.

    Args:
        custom_path: Optional custom database path for testing

    Returns:
        Path to beads database
    """
    if custom_path:
        return Path(custom_path)

    # Standard beads database location
    beads_dir = Path.cwd() / ".beads"
    if not beads_dir.exists():
        raise FileNotFoundError(
            f"Beads directory not found at {beads_dir}. "
            "Run this script from project root or use --db flag."
        )

    db_path = beads_dir / "beads.db"
    if not db_path.exists():
        raise FileNotFoundError(
            f"Beads database not found at {db_path}. "
            "Initialize beads first with 'bd init' command."
        )

    return db_path


def get_migrations_dir() -> Path:
    """Get path to migrations directory."""
    return Path(__file__).parent.parent / "db_migrations"


def read_migration_files() -> List[Tuple[str, str, str]]:
    """Read all migration SQL files from migrations directory.

    Returns:
        List of tuples (version, filename, sql_content)
    """
    migrations_dir = get_migrations_dir()
    if not migrations_dir.exists():
        raise FileNotFoundError(f"Migrations directory not found at {migrations_dir}")

    migrations = []
    for sql_file in sorted(migrations_dir.glob("*.sql")):
        version = sql_file.stem.split("_")[0]  # Extract version from filename
        content = sql_file.read_text(encoding="utf-8")
        migrations.append((version, sql_file.name, content))

    return migrations


def get_applied_versions(conn: sqlite3.Connection) -> set:
    """Get set of already-applied migration versions.

    Args:
        conn: Database connection

    Returns:
        Set of version strings (e.g., {'000', '001'})
    """
    cursor = conn.cursor()

    # Check if schema_version table exists
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if not cursor.fetchone():
        return set()

    # Get applied versions
    cursor.execute("SELECT version FROM schema_version")
    return {row[0] for row in cursor.fetchall()}


def apply_migration(
    conn: sqlite3.Connection, version: str, filename: str, sql: str
) -> None:
    """Apply a single migration to the database.

    Args:
        conn: Database connection
        version: Migration version (e.g., '001')
        filename: Migration filename for logging
        sql: SQL content to execute

    Raises:
        sqlite3.Error: If migration fails
    """
    cursor = conn.cursor()

    print(f"Applying migration {version} ({filename})...")

    try:
        # Execute migration SQL
        cursor.executescript(sql)
        conn.commit()
        print(f"  ✓ Migration {version} applied successfully")

    except sqlite3.Error as e:
        conn.rollback()
        print(f"  ✗ Migration {version} failed: {e}", file=sys.stderr)
        raise


def rollback_migration(conn: sqlite3.Connection, version: str) -> None:
    """Rollback a specific migration.

    Args:
        conn: Database connection
        version: Version to rollback

    Raises:
        ValueError: If rollback SQL not found
        sqlite3.Error: If rollback fails
    """
    cursor = conn.cursor()

    # Get rollback SQL from schema_version table
    cursor.execute(
        "SELECT rollback_sql FROM schema_version WHERE version = ?", (version,)
    )
    row = cursor.fetchone()

    if not row or not row[0]:
        raise ValueError(
            f"No rollback SQL found for version {version}. "
            "Cannot safely rollback this migration."
        )

    rollback_sql = row[0]
    print(f"Rolling back migration {version}...")

    try:
        # Execute rollback SQL
        cursor.executescript(rollback_sql)

        # Remove version from schema_version
        cursor.execute("DELETE FROM schema_version WHERE version = ?", (version,))

        conn.commit()
        print(f"  ✓ Migration {version} rolled back successfully")

    except sqlite3.Error as e:
        conn.rollback()
        print(f"  ✗ Rollback {version} failed: {e}", file=sys.stderr)
        raise


def show_status(db_path: Path) -> None:
    """Show migration status.

    Args:
        db_path: Path to database
    """
    conn = sqlite3.connect(db_path)
    try:
        applied = get_applied_versions(conn)
        migrations = read_migration_files()

        print(f"Database: {db_path}")
        print(f"Applied migrations: {len(applied)}")
        print(f"Available migrations: {len(migrations)}")
        print()

        print("Migration Status:")
        print("-" * 60)

        for version, filename, _ in migrations:
            status = "✓ Applied" if version in applied else "✗ Pending"
            print(f"  {version}: {filename:40} {status}")

        print("-" * 60)

    finally:
        conn.close()


def backup_database(db_path: Path) -> Path:
    """Create backup of database before migration.

    Args:
        db_path: Path to database

    Returns:
        Path to backup file
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.parent / f"{db_path.stem}.backup_{timestamp}{db_path.suffix}"

    import shutil

    shutil.copy2(db_path, backup_path)
    print(f"Created backup: {backup_path}")

    return backup_path


def apply_migrations(db_path: Path, auto_backup: bool = True) -> None:
    """Apply all pending migrations.

    Args:
        db_path: Path to database
        auto_backup: Whether to create automatic backup
    """
    if auto_backup:
        backup_database(db_path)

    conn = sqlite3.connect(db_path)
    try:
        applied = get_applied_versions(conn)
        migrations = read_migration_files()

        pending = [(v, f, s) for v, f, s in migrations if v not in applied]

        if not pending:
            print("No pending migrations.")
            return

        print(f"Found {len(pending)} pending migration(s)")
        print()

        for version, filename, sql in pending:
            apply_migration(conn, version, filename, sql)

        print()
        print("All migrations applied successfully!")

    except Exception as e:
        print(f"\nMigration failed: {e}", file=sys.stderr)
        print(
            "\nRestore from backup if needed: "
            "cp .beads/beads.db.backup_* .beads/beads.db",
            file=sys.stderr,
        )
        sys.exit(1)

    finally:
        conn.close()


def main() -> None:
    """Main entry point for migration runner."""
    parser = argparse.ArgumentParser(
        description="Beads database migration runner for ADW schema extensions"
    )
    parser.add_argument(
        "--db", help="Custom database path (default: .beads/beads.db)", default=None
    )
    parser.add_argument("--apply", action="store_true", help="Apply pending migrations")
    parser.add_argument("--status", action="store_true", help="Show migration status")
    parser.add_argument(
        "--rollback", action="store_true", help="Rollback a specific migration"
    )
    parser.add_argument(
        "--version", help="Version to rollback (use with --rollback)", default=None
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Skip automatic backup before migration",
    )

    args = parser.parse_args()

    # Validate arguments
    if not any([args.apply, args.status, args.rollback]):
        parser.print_help()
        sys.exit(1)

    if args.rollback and not args.version:
        print("Error: --version required with --rollback", file=sys.stderr)
        sys.exit(1)

    try:
        db_path = get_db_path(args.db)

        if args.status:
            show_status(db_path)

        elif args.apply:
            apply_migrations(db_path, auto_backup=not args.no_backup)

        elif args.rollback:
            conn = sqlite3.connect(db_path)
            try:
                rollback_migration(conn, args.version)
            finally:
                conn.close()

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
