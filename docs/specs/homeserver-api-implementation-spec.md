# Home Server API Implementation Specification

**Version**: 1.0
**Date**: 2025-10-11
**Purpose**: Enable KotaDB ADWs to poll for tasks and report status updates

---

## Overview

This document specifies the exact API endpoints needed on your home server to enable fully automated AI Developer Workflows (ADWs) from KotaDB. The KotaDB trigger script will poll these endpoints, claim tasks, and report progress/completion.

**Base URL**: `https://jaymins-mac-pro.tail1b7f44.ts.net`
**Base Endpoint**: `/api/tasks/kotadb`

---

## API Endpoints

### 1. GET /api/tasks/kotadb

**Purpose**: Fetch pending tasks available for ADW agents to claim

**Query Parameters**:
- `status` (string, required): Comma-separated list of statuses to filter by (e.g., `"pending"`)
- `limit` (integer, optional): Maximum number of tasks to return (default: 10)

**Request Example**:
```http
GET /api/tasks/kotadb?status=pending&limit=3
Host: jaymins-mac-pro.tail1b7f44.ts.net
```

**Response**: `200 OK`

**Response Body** (JSON array):
```json
[
  {
    "task_id": "issue-47-fulltext-search",
    "title": "Optimize search with PostgreSQL full-text search",
    "description": "Replace ILIKE with PostgreSQL full-text search using GIN indexes and ts_vector. See GitHub issue #47 for details. Update both src/db/migrations/ and supabase/migrations/ directories.",
    "status": "pending",
    "priority": "medium",
    "tags": {
      "workflow": "complex",
      "model": "sonnet",
      "github_issue": "47"
    },
    "worktree": null,
    "model": null,
    "workflow_type": null,
    "created_at": "2025-10-11T14:30:00Z",
    "claimed_at": null,
    "completed_at": null,
    "adw_id": null,
    "result": null,
    "error": null
  }
]
```

**Field Descriptions**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | string | Yes | Unique identifier for the task |
| `title` | string | Yes | Short, human-readable task title (max 100 chars) |
| `description` | string | Yes | Detailed task description with context |
| `status` | string | Yes | Current status: `pending`, `claimed`, `in_progress`, `completed`, `failed` |
| `priority` | string | No | Priority level: `low`, `medium`, `high` |
| `tags` | object | No | Key-value metadata for routing and configuration |
| `worktree` | string | No | Pre-assigned worktree name (optional, auto-generated if null) |
| `model` | string | No | Preferred Claude model: `sonnet`, `opus` |
| `workflow_type` | string | No | Workflow complexity: `simple`, `complex` |
| `created_at` | string (ISO 8601) | Yes | Task creation timestamp |
| `claimed_at` | string (ISO 8601) | No | Timestamp when task was claimed |
| `completed_at` | string (ISO 8601) | No | Timestamp when task finished |
| `adw_id` | string | No | ADW execution ID assigned when claimed |
| `result` | object | No | Execution results (commit hash, files modified, etc.) |
| `error` | string | No | Error message if task failed |

**Tags Convention**:
- `tags.workflow`: `"simple"` (use `/build`) or `"complex"` (use `/plan` + `/implement`)
- `tags.model`: `"sonnet"` (default, cheaper) or `"opus"` (more powerful)
- `tags.github_issue`: Link to GitHub issue number
- `tags.branch`: Suggested branch name

**Error Responses**:
- `400 Bad Request`: Invalid query parameters
- `500 Internal Server Error`: Database or server error

---

### 2. POST /api/tasks/kotadb/{task_id}/claim

**Purpose**: Claim a pending task, marking it as taken by an ADW agent

**Path Parameters**:
- `task_id` (string, required): The task ID to claim

**Request Body** (JSON):
```json
{
  "adw_id": "d081c104",
  "worktree": "feat-issue-47"
}
```

**Field Descriptions**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adw_id` | string | Yes | Unique ADW execution ID (8-char hex, e.g., from `uuid.uuid4()[:8]`) |
| `worktree` | string | No | Worktree/branch name where work will be done |

**Request Example**:
```http
POST /api/tasks/kotadb/issue-47-fulltext-search/claim
Host: jaymins-mac-pro.tail1b7f44.ts.net
Content-Type: application/json

{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search"
}
```

**Response**: `200 OK`

**Response Body**:
```json
{
  "success": true,
  "task_id": "issue-47-fulltext-search",
  "status": "claimed",
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search",
  "claimed_at": "2025-10-11T14:35:22Z"
}
```

**Database Actions**:
1. Update task record:
   - `status` → `"claimed"`
   - `adw_id` → provided value
   - `worktree` → provided value (if present)
   - `claimed_at` → current timestamp

**Error Responses**:
- `404 Not Found`: Task ID does not exist
- `409 Conflict`: Task already claimed by another agent
- `400 Bad Request`: Invalid request body
- `500 Internal Server Error`: Database error

**Notes**:
- This endpoint should be **idempotent** if the same `adw_id` claims the same task multiple times
- Consider adding a claim timeout (e.g., auto-release claims older than 1 hour)

---

### 3. POST /api/tasks/kotadb/{task_id}/start

**Purpose**: Mark task as actively being worked on (workflow script started execution)

**Path Parameters**:
- `task_id` (string, required): The task ID to update

**Request Body** (JSON):
```json
{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search"
}
```

**Request Example**:
```http
POST /api/tasks/kotadb/issue-47-fulltext-search/start
Host: jaymins-mac-pro.tail1b7f44.ts.net
Content-Type: application/json

{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search"
}
```

**Response**: `200 OK`

**Response Body**:
```json
{
  "success": true,
  "task_id": "issue-47-fulltext-search",
  "status": "in_progress",
  "started_at": "2025-10-11T14:35:30Z"
}
```

**Database Actions**:
1. Update task record:
   - `status` → `"in_progress"`
   - Add `started_at` timestamp (if your schema supports it)

**Error Responses**:
- `404 Not Found`: Task ID does not exist
- `403 Forbidden`: Task not claimed by this `adw_id`
- `400 Bad Request`: Invalid request body
- `500 Internal Server Error`: Database error

---

### 4. POST /api/tasks/kotadb/{task_id}/complete

**Purpose**: Mark task as successfully completed with results

**Path Parameters**:
- `task_id` (string, required): The task ID to complete

**Request Body** (JSON):
```json
{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search",
  "commit_hash": "a1b2c3d4e5f6",
  "result": {
    "files_modified": [
      "src/api/queries.ts",
      "src/db/migrations/0012_fulltext_search_index.sql",
      "supabase/migrations/20251011_fulltext_search_index.sql"
    ],
    "tests_passed": true,
    "type_check_passed": true,
    "workflow": "complex",
    "phases_completed": ["plan", "implement"]
  }
}
```

**Field Descriptions**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adw_id` | string | Yes | ADW execution ID |
| `worktree` | string | Yes | Worktree/branch name where work was done |
| `commit_hash` | string | No | Git commit hash of the changes (short or full SHA) |
| `result` | object | No | Structured metadata about the execution |

**Request Example**:
```http
POST /api/tasks/kotadb/issue-47-fulltext-search/complete
Host: jaymins-mac-pro.tail1b7f44.ts.net
Content-Type: application/json

{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search",
  "commit_hash": "a1b2c3d4",
  "result": {
    "files_modified": ["src/api/queries.ts", "src/db/migrations/0012_fulltext_search_index.sql"],
    "workflow": "complex"
  }
}
```

**Response**: `200 OK`

**Response Body**:
```json
{
  "success": true,
  "task_id": "issue-47-fulltext-search",
  "status": "completed",
  "completed_at": "2025-10-11T14:42:15Z",
  "duration_seconds": 405
}
```

**Database Actions**:
1. Update task record:
   - `status` → `"completed"`
   - `completed_at` → current timestamp
   - `result` → store provided result object
   - Calculate duration: `completed_at - claimed_at`

**Error Responses**:
- `404 Not Found`: Task ID does not exist
- `403 Forbidden`: Task not claimed by this `adw_id`
- `400 Bad Request`: Invalid request body
- `500 Internal Server Error`: Database error

---

### 5. POST /api/tasks/kotadb/{task_id}/fail

**Purpose**: Mark task as failed with error details

**Path Parameters**:
- `task_id` (string, required): The task ID to mark as failed

**Request Body** (JSON):
```json
{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search",
  "error": "Type check failed: src/api/queries.ts:148 - Property 'textSearch' does not exist on type 'PostgrestQueryBuilder'"
}
```

**Field Descriptions**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adw_id` | string | Yes | ADW execution ID |
| `worktree` | string | No | Worktree/branch name where work was attempted |
| `error` | string | Yes | Human-readable error message (max 1000 chars) |

**Request Example**:
```http
POST /api/tasks/kotadb/issue-47-fulltext-search/fail
Host: jaymins-mac-pro.tail1b7f44.ts.net
Content-Type: application/json

{
  "adw_id": "d081c104",
  "worktree": "feat-fulltext-search",
  "error": "Worktree directory not found: /Users/jayminwest/Projects/kota-db-ts/trees/feat-fulltext-search"
}
```

**Response**: `200 OK`

**Response Body**:
```json
{
  "success": true,
  "task_id": "issue-47-fulltext-search",
  "status": "failed",
  "failed_at": "2025-10-11T14:38:10Z",
  "error": "Worktree directory not found: /Users/jayminwest/Projects/kota-db-ts/trees/feat-fulltext-search"
}
```

**Database Actions**:
1. Update task record:
   - `status` → `"failed"`
   - `completed_at` → current timestamp (or use `failed_at` if separate field)
   - `error` → store provided error message

**Error Responses**:
- `404 Not Found`: Task ID does not exist
- `403 Forbidden`: Task not claimed by this `adw_id`
- `400 Bad Request`: Invalid request body or missing error message
- `500 Internal Server Error`: Database error

---

## Database Schema Recommendation

### Tasks Table

```sql
CREATE TABLE tasks (
  task_id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority VARCHAR(10),
  tags JSONB DEFAULT '{}',
  worktree VARCHAR(100),
  model VARCHAR(20),
  workflow_type VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  adw_id VARCHAR(50),
  result JSONB,
  error TEXT,

  -- Indexes for efficient polling
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_adw_id (adw_id)
);
```

**Status State Machine**:
```
pending → claimed → in_progress → completed
                                → failed
```

---

## Status Update Protocol

### From KotaDB ADW Perspective

1. **Poll** for tasks:
   ```
   GET /api/tasks/kotadb?status=pending&limit=3
   ```

2. **Claim** a task immediately:
   ```
   POST /api/tasks/kotadb/{task_id}/claim
   Body: {"adw_id": "abc12345", "worktree": "feat-task-name"}
   ```

3. **Create worktree** (local git operation, no API call)

4. **Start execution**:
   ```
   POST /api/tasks/kotadb/{task_id}/start
   Body: {"adw_id": "abc12345"}
   ```

5. **Execute workflow** (run `/build` or `/plan` + `/implement`)

6a. **On success**:
   ```
   POST /api/tasks/kotadb/{task_id}/complete
   Body: {
     "adw_id": "abc12345",
     "commit_hash": "a1b2c3d4",
     "result": {"files_modified": [...]}
   }
   ```

6b. **On failure**:
   ```
   POST /api/tasks/kotadb/{task_id}/fail
   Body: {
     "adw_id": "abc12345",
     "error": "Error message here"
   }
   ```

---

## Communication & Observability

### Recommended Additional Features

#### 1. Task Activity Log Endpoint (Optional)

**GET /api/tasks/kotadb/{task_id}/activity**

Returns a timeline of status changes and updates for a task:

```json
[
  {
    "timestamp": "2025-10-11T14:35:22Z",
    "action": "claimed",
    "adw_id": "d081c104",
    "details": {"worktree": "feat-fulltext-search"}
  },
  {
    "timestamp": "2025-10-11T14:35:30Z",
    "action": "started",
    "adw_id": "d081c104"
  },
  {
    "timestamp": "2025-10-11T14:42:15Z",
    "action": "completed",
    "adw_id": "d081c104",
    "details": {"commit_hash": "a1b2c3d4", "files_modified": [...]}
  }
]
```

**Benefits**:
- Debugging failed tasks
- Understanding agent behavior
- Performance metrics

#### 2. Heartbeat Updates (Optional)

**POST /api/tasks/kotadb/{task_id}/heartbeat**

Allow ADW agents to send periodic "still alive" updates during long-running tasks:

```json
{
  "adw_id": "d081c104",
  "progress": {
    "phase": "implement",
    "message": "Executing /implement template",
    "percent_complete": 65
  }
}
```

**Benefits**:
- Detect stalled agents
- Real-time progress tracking
- Better UX for long tasks

#### 3. Metrics Endpoint (Optional)

**GET /api/tasks/kotadb/metrics**

Return aggregate statistics:

```json
{
  "total_tasks": 47,
  "pending": 3,
  "claimed": 1,
  "in_progress": 2,
  "completed": 38,
  "failed": 3,
  "avg_duration_seconds": 412,
  "success_rate": 0.927
}
```

---

## Error Handling Best Practices

### ADW Agent Side (KotaDB)

1. **Retry logic**: For transient errors (500, 503), retry up to 3 times with exponential backoff
2. **Timeout handling**: Set reasonable timeouts (10s for status updates)
3. **Graceful degradation**: If status updates fail, log locally but continue workflow
4. **Idempotency**: Same `adw_id` should be able to retry claims/updates safely

### Home Server Side

1. **Validation**: Validate all incoming data (task_id exists, adw_id matches, etc.)
2. **Atomicity**: Use database transactions for status updates
3. **Logging**: Log all API calls with timestamps, task_id, adw_id
4. **Rate limiting**: Protect against runaway polling (though same agent, so less critical)

---

## Security Considerations

### Authentication

**Current**: None (Tailscale network isolation provides security)

**Future Considerations**:
- API key authentication via `Authorization: Bearer <token>` header
- JWT tokens for agent identity
- IP allowlisting (already implicit with Tailscale)

### Data Validation

- **Input sanitization**: Validate all string inputs (task_id, error messages)
- **Max lengths**: Enforce reasonable limits on text fields
- **JSON validation**: Validate structure of `tags` and `result` objects

---

## Testing Checklist

### Manual Testing

- [ ] Create a task with `status: "pending"` in database
- [ ] Poll: `GET /api/tasks/kotadb?status=pending&limit=1`
- [ ] Claim: `POST .../claim` with valid `adw_id`
- [ ] Verify task status changed to `"claimed"` in database
- [ ] Start: `POST .../start`
- [ ] Verify status changed to `"in_progress"`
- [ ] Complete: `POST .../complete` with commit hash
- [ ] Verify status changed to `"completed"` and `result` stored
- [ ] Create another pending task
- [ ] Claim it, then fail: `POST .../fail` with error message
- [ ] Verify status changed to `"failed"` and error stored

### Edge Cases

- [ ] Try to claim already-claimed task (should return 409 Conflict)
- [ ] Try to complete task with wrong `adw_id` (should return 403 Forbidden)
- [ ] Try to update non-existent task (should return 404 Not Found)
- [ ] Send malformed JSON (should return 400 Bad Request)
- [ ] Poll with no pending tasks (should return empty array `[]`)

### Integration Testing

- [ ] Run KotaDB trigger script: `uv run adws/adw_triggers/adw_trigger_cron_homeserver.py --once`
- [ ] Verify it fetches, claims, and updates tasks correctly
- [ ] Let a full workflow run (create worktree, execute, commit, report back)

---

## Example Implementation (Python/Flask)

```python
from flask import Flask, request, jsonify
from datetime import datetime
import psycopg2

app = Flask(__name__)

@app.route('/api/tasks/kotadb', methods=['GET'])
def get_tasks():
    status_filter = request.args.get('status', 'pending')
    limit = int(request.args.get('limit', 10))

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT task_id, title, description, status, priority, tags,
               worktree, model, workflow_type, created_at, claimed_at,
               completed_at, adw_id, result, error
        FROM tasks
        WHERE status = ANY(%s)
        ORDER BY created_at ASC
        LIMIT %s
    """, (status_filter.split(','), limit))

    tasks = []
    for row in cur.fetchall():
        tasks.append({
            "task_id": row[0],
            "title": row[1],
            "description": row[2],
            "status": row[3],
            "priority": row[4],
            "tags": row[5] or {},
            "worktree": row[6],
            "model": row[7],
            "workflow_type": row[8],
            "created_at": row[9].isoformat() if row[9] else None,
            "claimed_at": row[10].isoformat() if row[10] else None,
            "completed_at": row[11].isoformat() if row[11] else None,
            "adw_id": row[12],
            "result": row[13],
            "error": row[14]
        })

    cur.close()
    conn.close()

    return jsonify(tasks)

@app.route('/api/tasks/kotadb/<task_id>/claim', methods=['POST'])
def claim_task(task_id):
    data = request.json
    adw_id = data.get('adw_id')
    worktree = data.get('worktree')

    if not adw_id:
        return jsonify({"error": "adw_id is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    # Check if task exists and is pending
    cur.execute("SELECT status FROM tasks WHERE task_id = %s", (task_id,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    if row[0] != 'pending':
        cur.close()
        conn.close()
        return jsonify({"error": "Task already claimed"}), 409

    # Claim the task
    claimed_at = datetime.utcnow()
    cur.execute("""
        UPDATE tasks
        SET status = 'claimed', adw_id = %s, worktree = %s, claimed_at = %s
        WHERE task_id = %s
    """, (adw_id, worktree, claimed_at, task_id))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "success": True,
        "task_id": task_id,
        "status": "claimed",
        "adw_id": adw_id,
        "worktree": worktree,
        "claimed_at": claimed_at.isoformat()
    })

# Similar implementations for /start, /complete, /fail...
```

---

## Summary

Implement these 5 endpoints on your home server:

1. ✅ **GET /api/tasks/kotadb** - Poll for pending tasks
2. ✅ **POST /api/tasks/kotadb/{task_id}/claim** - Claim a task
3. ⚠️ **POST /api/tasks/kotadb/{task_id}/start** - Mark as in-progress
4. ⚠️ **POST /api/tasks/kotadb/{task_id}/complete** - Mark as completed
5. ⚠️ **POST /api/tasks/kotadb/{task_id}/fail** - Mark as failed

Once implemented, the KotaDB trigger script will automatically:
- Poll your API every 15 seconds
- Claim tasks
- Create worktrees
- Execute workflows
- Report back results

**End of Specification**
