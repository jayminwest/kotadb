# Feature Plan: Beads Database Extension for ADW State Management

## Overview

### Problem
ADW workflows currently persist execution state in JSON files (`adw_state.json`, `checkpoints.json`). This limits observability to manual log parsing and prevents SQL-based analytics across issues and workflow executions. The lack of relational queries makes it difficult to answer critical questions like "What's the success rate by issue type?" or "Which checkpoints are stale across all executions?"

### Desired Outcome
Extend the beads SQLite database with ADW execution history tables to enable relational queries across issues, agent workflows, and checkpoints. Replace JSON file state management with database persistence while maintaining backward compatibility during migration.

### Non-Goals
- Complete removal of JSON files (maintain for backward compatibility during Phase 3)
- Real-time streaming analytics (focus on batch analysis)
- Web dashboard UI (focus on SQL query foundation)
- Beads CLI integration for ADW commands (out of scope, focus on backend persistence)

## Technical Approach

### Architecture Notes
- Extend existing beads SQLite database (`.beads/kota-db-ts.db`) with two new tables: `adw_executions` and `adw_checkpoints`
- Foreign key relationships connect ADW data to beads issues table for unified issue + execution tracking
- Schema versioning system ensures migrations are applied once and support rollback for safety
- Database writes wrapped in transactions for atomicity
- Concurrent write safety via SQLite SERIALIZABLE isolation + exponential backoff retry logic

### Key Modules to Touch
- `automation/adws/adw_modules/state.py`: Replace JSON persistence with SQLite writes via new `BeadsStateManager` class
- `automation/adws/scripts/analyze_logs.py`: Replace log parsing with SQL queries for metrics extraction
- `automation/adws/adw_phases/*.py`: Update phase scripts to use `BeadsStateManager` for state persistence

### Data/API Impacts
- **Database Schema Addition**: Two new tables (`adw_executions`, `adw_checkpoints`) with indexes for common query patterns
- **State Persistence API Change**: Phase scripts will call `BeadsStateManager` methods instead of `ADWState.save()`
- **Backward Compatibility**: JSON files remain as fallback during migration, deprecated warnings logged
- **Migration Runner**: New CLI tool `automation/adws/scripts/migrate_beads_schema.py` for one-time schema upgrades
- **SQL Views**: Create views for common queries (`recent_failures`, `stale_checkpoints`, `success_rate_by_type`)

## Relevant Files

### Existing Files to Modify
- `automation/adws/adw_modules/state.py` — Add `BeadsStateManager` class for database persistence alongside existing JSON-based `ADWState`
- `automation/adws/adw_phases/adw_plan.py` — Update to write execution state to database via `BeadsStateManager`
- `automation/adws/adw_phases/adw_build.py` — Update to write execution state to database via `BeadsStateManager`
- `automation/adws/adw_phases/adw_review.py` — Update to write execution state to database via `BeadsStateManager`
- `automation/adws/scripts/analyze_logs.py` — Replace log parsing with SQL queries for success rate, phase funnel, failure patterns

### New Files
- `automation/adws/db_migrations/001_add_adw_tables.sql` — DDL for `adw_executions` and `adw_checkpoints` tables with indexes
- `automation/adws/db_migrations/002_create_views.sql` — SQL views for common observability queries
- `automation/adws/scripts/migrate_beads_schema.py` — Migration runner script with rollback support
- `automation/adws/tests/test_beads_database.py` — Integration tests for database persistence (CRUD, concurrency, performance)
- `automation/adws/tests/test_beads_state_manager.py` — Unit tests for `BeadsStateManager` class

## Task Breakdown

### Phase 1: Schema Design and Migration Infrastructure (1 day)
- Design `adw_executions` and `adw_checkpoints` table schemas with foreign keys to beads issues
- Create schema version tracking table (`schema_version`)
- Implement migration runner script with apply/rollback support
- Write DDL migration files (`001_add_adw_tables.sql`, `002_create_views.sql`)
- Create SQL views for common queries (`recent_failures`, `stale_checkpoints`)
- Validate schema design with real-world ADW execution data from JSON files

### Phase 2: State Manager Implementation (3-4 days)
- Implement `BeadsStateManager` class in `automation/adws/adw_modules/state.py`
- Add methods: `create_execution()`, `update_execution_status()`, `save_checkpoint()`, `load_checkpoint()`
- Wrap database writes in transactions for atomicity
- Add retry logic for database lock errors (exponential backoff: 1s, 3s, 5s)
- Test concurrent writes with 5+ agents to validate locking strategy
- Update phase scripts (`adw_plan.py`, `adw_build.py`, `adw_review.py`) to use `BeadsStateManager`
- Maintain JSON file persistence as fallback (log deprecation warnings)
- Add integration tests for state persistence across process restart

### Phase 3: Observability Integration (2-3 days)
- Update `analyze_logs.py` to query beads database for metrics instead of parsing logs
- Implement SQL-based functions: `get_success_rate_by_issue_type()`, `get_phase_funnel()`, `get_failure_distribution()`
- Add database export tool for metrics dashboard integration (JSON, CSV formats)
- Benchmark query performance (<10ms for common operations, <20ms for joins)
- Update documentation with SQL query examples
- Validate metrics match existing log-based results for continuity

## Step by Step Tasks

### Migration Setup
- Create migration directory structure: `automation/adws/db_migrations/`
- Write DDL for schema version table in `000_schema_version.sql`
- Implement migration runner in `automation/adws/scripts/migrate_beads_schema.py` with `--apply`, `--rollback`, `--status` flags
- Test migration runner on copy of production database
- Backup database before migration: `cp .beads/kota-db-ts.db .beads/kota-db-ts.db.backup`

### Schema Design
- Write `001_add_adw_tables.sql` with `adw_executions` and `adw_checkpoints` table DDL
- Add foreign key constraints: `FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE`
- Create indexes: `idx_executions_issue`, `idx_executions_status`, `idx_executions_phase`, `idx_checkpoints_execution`
- Write `002_create_views.sql` with `recent_failures` and `stale_checkpoints` views
- Document schema in migration file comments for maintainability

### State Manager Implementation
- Add `BeadsStateManager` class to `automation/adws/adw_modules/state.py`
- Implement constructor: `__init__(self, db_path: str)` with connection pooling
- Implement `create_execution()` method with transaction wrapping
- Implement `update_execution_status()` method with completion timestamp
- Implement `save_checkpoint()` method with JSON data serialization
- Implement `load_checkpoint()` method with deserialization and validation
- Add retry logic wrapper for database lock errors (max 3 retries, exponential backoff)
- Add database connection health check method

### Phase Script Integration
- Update `adw_plan.py` to create execution record via `BeadsStateManager.create_execution()`
- Update `adw_build.py` to save checkpoints via `BeadsStateManager.save_checkpoint()`
- Update `adw_review.py` to update execution status via `BeadsStateManager.update_execution_status()`
- Preserve JSON file writes with deprecation warnings logged
- Test phase scripts with beads database backend (validate state persistence)

### Observability Updates
- Refactor `analyze_logs.py` to accept `--backend` flag: `json` (default, current behavior) or `database` (new)
- Implement `get_success_rate_by_issue_type(db_path, hours)` SQL query function
- Implement `get_phase_funnel(db_path, hours)` for plan → build → review progression
- Implement `get_failure_distribution(db_path, hours)` for error pattern aggregation
- Add `--export` flag for JSON/CSV output formats
- Benchmark query performance with 100, 500, 1000 executions

### Testing
- Create `automation/adws/tests/test_beads_state_manager.py` with unit tests for CRUD operations
- Create `automation/adws/tests/test_beads_database.py` with integration tests for concurrency and performance
- Test foreign key cascade deletes: delete issue, verify execution cleanup
- Test concurrent execution creation with 5+ agents (no race conditions)
- Test checkpoint persistence across process restart
- Validate query performance benchmarks (<10ms target for common operations)

### Documentation and Validation
- Update `automation/adws/README.md` with beads database integration section
- Document SQL schema and views in `docs/beads-database-schema.md`
- Add SQL query examples for common observability tasks
- Run validation: `cd automation && uv run pytest adws/tests/test_beads_*.py -v`
- Run performance benchmarks: `cd automation && uv run python adws/scripts/benchmark_queries.py`
- Rerun log analysis with database backend: `cd automation && uv run python adws/scripts/analyze_logs.py --backend database --hours 24`
- Push branch: `git push -u origin feat/304-beads-database-extension`

## Risks & Mitigations

### Risk 1: Database Migration Failures
**Impact**: Schema migration breaks existing beads database, preventing issue tracking and workflow execution
**Mitigation**:
- Test migrations on copy of production database before deployment: `cp .beads/kota-db-ts.db test.db && python migrate_beads_schema.py --db test.db --apply`
- Implement rollback mechanism: `python migrate_beads_schema.py --rollback --version 001`
- Backup database before migration: `cp .beads/kota-db-ts.db .beads/kota-db-ts.db.backup`
- Add migration validation checks: verify table existence, foreign key constraints, index creation
- Document manual recovery steps in migration script docstring

### Risk 2: Performance Degradation with Large Execution History
**Impact**: Queries slow down with 10,000+ executions, affecting observability responsiveness
**Mitigation**:
- Add indexes for common query patterns (status, phase, started_at) — already in schema design
- Archive old executions periodically (e.g., after 90 days) via `archive_old_executions()` function
- Monitor query performance in observability metrics dashboard (track 95th percentile latency)
- Benchmark queries with 1000, 5000, 10000 executions to establish performance baselines
- Consider SQLite WAL mode for better concurrent read performance if needed

### Risk 3: Concurrent Write Conflicts
**Impact**: Multiple agents writing to database simultaneously causes lock errors, failed executions
**Mitigation**:
- SQLite SERIALIZABLE isolation handles locking automatically (default behavior)
- Add retry logic with exponential backoff (3 retries, 1s/3s/5s delays) in `BeadsStateManager`
- Test concurrent writes with 5+ agents in integration tests (`test_concurrent_execution_creation`)
- Use transactions for atomic multi-statement operations (e.g., create execution + first checkpoint)
- Monitor lock error frequency in logs, adjust retry strategy if needed

### Risk 4: Backward Compatibility Break
**Impact**: Existing ADW workflows fail after database migration due to missing JSON files or API changes
**Mitigation**:
- Keep JSON file persistence as fallback during transition (Phase 2 implementation)
- Log deprecation warnings when JSON files used (help users migrate gradually)
- Gradual migration: new workflows use database, old workflows continue with JSON
- Feature flag: `ADW_USE_BEADS_STATE=true` (default: false until Phase 3 validation complete)
- Maintain dual-write mode during transition: write to both database and JSON for safety

## Validation Strategy

### Automated Tests
#### Unit Tests (`test_beads_state_manager.py`)
- Test `BeadsStateManager` CRUD operations (create execution, update status, save/load checkpoint)
- Test checkpoint save/load with complex data structures (nested dicts, arrays)
- Test transaction rollback on errors (verify no partial writes)
- Test retry logic for database lock errors (mock lock errors, verify exponential backoff)
- Test connection health check (verify detection of database unavailability)

#### Integration Tests (`test_beads_database.py`)
- Test concurrent execution creation (5+ agents, no race conditions)
- Test checkpoint persistence across process restart (save checkpoint, restart Python, load checkpoint)
- Test foreign key cascade deletes (delete issue, verify execution and checkpoint cleanup)
- Test query performance with 100, 500, 1000 executions (validate <10ms target)
- Test `analyze_logs.py` with beads database backend (compare metrics with JSON backend)
- Test migration runner (apply migrations, rollback, verify schema version)

### Manual Checks
#### Data Seeding
- Run 10 ADW workflows with beads database backend enabled
- Seed database with realistic execution data: 5 successful, 3 failed, 2 in-progress
- Create checkpoints at various phases (plan, build, review) for recovery testing
- Verify data appears in SQLite database: `sqlite3 .beads/kota-db-ts.db 'SELECT * FROM adw_executions;'`

#### Failure Scenarios
- Test database unavailability: rename database file, verify graceful fallback to JSON
- Test concurrent writes: run 3 workflows simultaneously, verify no duplicate execution IDs
- Test checkpoint recovery: kill workflow mid-execution, restart, verify checkpoint loaded
- Test schema version mismatch: attempt to apply migration twice, verify idempotency

#### SQL Query Validation
- Run success rate query: `SELECT COUNT(*) * 100.0 / (SELECT COUNT(*) FROM adw_executions) FROM adw_executions WHERE status = 'completed';`
- Run phase funnel query: verify counts match log-based analysis results
- Run recent failures query: verify results include error messages and issue context
- Benchmark query latency: run 10 iterations, verify <10ms average for common operations

### Release Guardrails
#### Monitoring
- Add database write latency metric to ADW observability dashboard
- Monitor database file size growth (alert if >50MB, investigate archival strategy)
- Track retry count for database lock errors (alert if >10% of writes require retry)

#### Alerting
- Alert if database query latency exceeds 50ms (p95) for 5 consecutive minutes
- Alert if database file missing or corrupted (detect via connection health check)
- Alert if migration version mismatch detected (schema version doesn't match latest migration)

#### Rollback
- If critical bugs found, disable beads database backend via feature flag: `ADW_USE_BEADS_STATE=false`
- If database corruption detected, restore from backup: `cp .beads/kota-db-ts.db.backup .beads/kota-db-ts.db`
- If performance degradation, revert to JSON backend and investigate schema optimization

## Validation Commands

### Lint and Type-Check
```bash
cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py
cd automation && uv run mypy adws/adw_modules/state.py --strict
```

### Unit Tests
```bash
cd automation && uv run pytest adws/tests/test_beads_state_manager.py -v
cd automation && uv run pytest adws/tests/test_beads_database.py -v
```

### Integration Tests
```bash
cd automation && uv run pytest adws/tests/test_beads_database.py::test_concurrent_execution_creation -v
cd automation && uv run pytest adws/tests/test_beads_database.py::test_checkpoint_persistence_across_restart -v
cd automation && uv run pytest adws/tests/test_beads_database.py::test_foreign_key_cascade_deletes -v
```

### Performance Benchmarks
```bash
cd automation && uv run python adws/scripts/benchmark_queries.py --executions 100,500,1000 --iterations 10
```

### Migration Runner
```bash
cd automation && uv run python adws/scripts/migrate_beads_schema.py --apply
cd automation && uv run python adws/scripts/migrate_beads_schema.py --status
cd automation && uv run python adws/scripts/migrate_beads_schema.py --rollback --version 001
```

### Log Analysis with Database Backend
```bash
cd automation && uv run python adws/scripts/analyze_logs.py --backend database --hours 24 --format json
cd automation && uv run python adws/scripts/analyze_logs.py --backend database --env local --format markdown --output file --output-file metrics.md
```

### SQL Query Validation
```bash
sqlite3 .beads/kota-db-ts.db 'SELECT * FROM adw_executions LIMIT 10;'
sqlite3 .beads/kota-db-ts.db 'SELECT * FROM adw_checkpoints WHERE execution_id = "abc-123";'
sqlite3 .beads/kota-db-ts.db 'SELECT * FROM recent_failures LIMIT 5;'
sqlite3 .beads/kota-db-ts.db 'SELECT * FROM stale_checkpoints LIMIT 5;'
```

### Full Test Suite
```bash
cd automation && uv sync && uv run pytest adws/tests/ -v --tb=short
```

## Issue Relationships

- **Child Of**: #300 (epic: integrate beads dependency-aware issue tracker) - Phase 3: Database extension for ADW state
- **Depends On**: #303 (Phase 2: ADW Integration) - Must validate beads adoption before extending database
- **Related To**: #297 (ADW workflow orchestration tools for MCP) - Database provides state backend for MCP queries
- **Follow-Up**: Metrics dashboard integration - Use database export for visualization layer
