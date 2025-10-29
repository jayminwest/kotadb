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

def get_db_path(custom_path: str | None=None) -> Path:
    """Get path to beads database.

    Args:
        custom_path: Optional custom database path for testing

    Returns:
        Path to beads database
    """
    if custom_path:
        return Path(custom_path)
    beads_dir = Path.cwd() / '.beads'
    if not beads_dir.exists():
        raise FileNotFoundError(f'Beads directory not found at {beads_dir}. Run this script from project root or use --db flag.')
    db_path = beads_dir / 'beads.db'
    if not db_path.exists():
        raise FileNotFoundError(f"Beads database not found at {db_path}. Initialize beads first with 'bd init' command.")
    return db_path

def get_migrations_dir() -> Path:
    """Get path to migrations directory."""
    return Path(__file__).parent.parent / 'db_migrations'

def read_migration_files() -> List[Tuple[str, str, str]]:
    """Read all migration SQL files from migrations directory.

    Returns:
        List of tuples (version, filename, sql_content)
    """
    migrations_dir = get_migrations_dir()
    if not migrations_dir.exists():
        raise FileNotFoundError(f'Migrations directory not found at {migrations_dir}')
    migrations = []
    for sql_file in sorted(migrations_dir.glob('*.sql')):
        version = sql_file.stem.split('_')[0]
        content = sql_file.read_text(encoding='utf-8')
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
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    if not cursor.fetchone():
        return set()
    cursor.execute('SELECT version FROM schema_version')
    return {row[0] for row in cursor.fetchall()}

def apply_migration(conn: sqlite3.Connection, version: str, filename: str, sql: str) -> None:
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
    sys.stdout.write(f'Applying migration {version} ({filename})...' + '\n')
    try:
        cursor.executescript(sql)
        conn.commit()
        sys.stdout.write(f'  ✓ Migration {version} applied successfully' + '\n')
    except sqlite3.Error as e:
        conn.rollback()
        sys.stderr.write(f'  ✗ Migration {version} failed: {e}' + '\n')
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
    cursor.execute('SELECT rollback_sql FROM schema_version WHERE version = ?', (version,))
    row = cursor.fetchone()
    if not row or not row[0]:
        raise ValueError(f'No rollback SQL found for version {version}. Cannot safely rollback this migration.')
    rollback_sql = row[0]
    sys.stdout.write(f'Rolling back migration {version}...' + '\n')
    try:
        cursor.executescript(rollback_sql)
        cursor.execute('DELETE FROM schema_version WHERE version = ?', (version,))
        conn.commit()
        sys.stdout.write(f'  ✓ Migration {version} rolled back successfully' + '\n')
    except sqlite3.Error as e:
        conn.rollback()
        sys.stderr.write(f'  ✗ Rollback {version} failed: {e}' + '\n')
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
        sys.stdout.write(f'Database: {db_path}' + '\n')
        sys.stdout.write(f'Applied migrations: {len(applied)}' + '\n')
        sys.stdout.write(f'Available migrations: {len(migrations)}' + '\n')
        sys.stdout.write('\n')
        sys.stdout.write('Migration Status:' + '\n')
        sys.stdout.write('-' * 60 + '\n')
        for version, filename, _ in migrations:
            status = '✓ Applied' if version in applied else '✗ Pending'
            sys.stdout.write(f'  {version}: {filename:40} {status}' + '\n')
        sys.stdout.write('-' * 60 + '\n')
    finally:
        conn.close()

def backup_database(db_path: Path) -> Path:
    """Create backup of database before migration.

    Args:
        db_path: Path to database

    Returns:
        Path to backup file
    """
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = db_path.parent / f'{db_path.stem}.backup_{timestamp}{db_path.suffix}'
    import shutil
    shutil.copy2(db_path, backup_path)
    sys.stdout.write(f'Created backup: {backup_path}' + '\n')
    return backup_path

def apply_migrations(db_path: Path, auto_backup: bool=True) -> None:
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
            sys.stdout.write('No pending migrations.' + '\n')
            return
        sys.stdout.write(f'Found {len(pending)} pending migration(s)' + '\n')
        sys.stdout.write('\n')
        for version, filename, sql in pending:
            apply_migration(conn, version, filename, sql)
        sys.stdout.write('\n')
        sys.stdout.write('All migrations applied successfully!' + '\n')
    except Exception as e:
        sys.stderr.write(f'\nMigration failed: {e}' + '\n')
        sys.stderr.write('\nRestore from backup if needed: cp .beads/beads.db.backup_* .beads/beads.db' + '\n')
        sys.exit(1)
    finally:
        conn.close()

def main() -> None:
    """Main entry point for migration runner."""
    parser = argparse.ArgumentParser(description='Beads database migration runner for ADW schema extensions')
    parser.add_argument('--db', help='Custom database path (default: .beads/beads.db)', default=None)
    parser.add_argument('--apply', action='store_true', help='Apply pending migrations')
    parser.add_argument('--status', action='store_true', help='Show migration status')
    parser.add_argument('--rollback', action='store_true', help='Rollback a specific migration')
    parser.add_argument('--version', help='Version to rollback (use with --rollback)', default=None)
    parser.add_argument('--no-backup', action='store_true', help='Skip automatic backup before migration')
    args = parser.parse_args()
    if not any([args.apply, args.status, args.rollback]):
        parser.print_help()
        sys.exit(1)
    if args.rollback and (not args.version):
        sys.stderr.write('Error: --version required with --rollback' + '\n')
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
        sys.stderr.write(f'Error: {e}' + '\n')
        sys.exit(1)
if __name__ == '__main__':
    main()