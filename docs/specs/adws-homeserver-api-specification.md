# Home Server API Specification for KotaDB ADWs Integration

**Version**: 1.0
**Date**: 2025-10-11
**Status**: Design Specification
**Server**: <YOUR_HOMESERVER>.ts.net (Tailscale)

---

## Executive Summary

This document specifies the REST API contract for the home server task management system that integrates with KotaDB's AI Developer Workflows (ADWs). The API provides endpoints for task lifecycle management (create, read, update) and is accessed securely via Tailscale without requiring authentication.

**Base URL**: `https://<YOUR_HOMESERVER>.ts.net`
**API Prefix**: `/api/tasks/kotadb`
**Authentication**: None (Tailscale network security)
**Protocol**: HTTPS
**Content-Type**: `application/json`

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Data Models](#data-models)
3. [Status Transitions](#status-transitions)
4. [Error Handling](#error-handling)
5. [Example Requests](#example-requests)
6. [Database Schema](#database-schema)
7. [Implementation Checklist](#implementation-checklist)

---

## API Endpoints

### 1. List Tasks (GET)

**Endpoint**: `GET /api/tasks/kotadb`

**Purpose**: Fetch tasks filtered by status and limit

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string or string[] | No | All statuses | Filter by task status (pending, claimed, in_progress, completed, failed) |
| `limit` | integer | No | 10 | Maximum number of tasks to return |
| `priority` | string | No | All priorities | Filter by priority (low, medium, high) |

**Example Requests**:
```
GET /api/tasks/kotadb?status=pending&limit=5
GET /api/tasks/kotadb?status=pending&status=claimed&limit=10
GET /api/tasks/kotadb?status=failed
```

**Response**: `200 OK`
```json
[
  {
    "task_id": "task-001",
    "title": "Add rate limiting middleware",
    "description": "Implement tier-based rate limiting for API endpoints using the existing auth system...",
    "status": "pending",
    "priority": "high",
    "tags": {
      "model": "sonnet",
      "workflow": "complex"
    },
    "worktree": null,
    "created_at": "2025-10-11T10:30:00Z",
    "claimed_at": null,
    "completed_at": null,
    "adw_id": null,
    "result": null,
    "error": null
  },
  {
    "task_id": "task-002",
    "title": "Fix typo in README",
    "description": "Change 'indexng' to 'indexing' in README.md line 42",
    "status": "pending",
    "priority": "low",
    "tags": {
      "model": "sonnet",
      "workflow": "simple"
    },
    "worktree": "docs-typo-fix",
    "created_at": "2025-10-11T11:15:00Z",
    "claimed_at": null,
    "completed_at": null,
    "adw_id": null,
    "result": null,
    "error": null
  }
]
```

**Error Response**: `500 Internal Server Error`
```json
{
  "error": "Database connection failed",
  "details": "..."
}
```

---

### 2. Get Task by ID (GET)

**Endpoint**: `GET /api/tasks/kotadb/{task_id}`

**Purpose**: Retrieve a single task by its unique identifier

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Example Request**:
```
GET /api/tasks/kotadb/task-001
```

**Response**: `200 OK`
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting middleware",
  "description": "Implement tier-based rate limiting...",
  "status": "claimed",
  "priority": "high",
  "tags": {
    "model": "sonnet",
    "workflow": "complex"
  },
  "worktree": "feat-rate-limiting",
  "created_at": "2025-10-11T10:30:00Z",
  "claimed_at": "2025-10-11T14:22:15Z",
  "completed_at": null,
  "adw_id": "abc12345",
  "result": null,
  "error": null
}
```

**Error Response**: `404 Not Found`
```json
{
  "error": "Task not found",
  "task_id": "task-001"
}
```

---

### 3. Create Task (POST)

**Endpoint**: `POST /api/tasks/kotadb`

**Purpose**: Create a new task

**Request Body**:
```json
{
  "title": "Add rate limiting middleware",
  "description": "Implement tier-based rate limiting for API endpoints using the existing auth system. Should support free (100/hr), solo (1000/hr), and team (10000/hr) tiers.",
  "priority": "high",
  "tags": {
    "model": "sonnet",
    "workflow": "complex"
  },
  "worktree": null
}
```

**Required Fields**:
- `title` (string, 1-200 characters)
- `description` (string, 1-5000 characters)

**Optional Fields**:
- `priority` (string: "low" | "medium" | "high", default: "medium")
- `tags` (object, default: {})
- `worktree` (string, nullable, default: null - auto-generated if null)

**Response**: `201 Created`
```json
{
  "task_id": "task-003",
  "title": "Add rate limiting middleware",
  "description": "Implement tier-based rate limiting...",
  "status": "pending",
  "priority": "high",
  "tags": {
    "model": "sonnet",
    "workflow": "complex"
  },
  "worktree": null,
  "created_at": "2025-10-11T14:30:00Z",
  "claimed_at": null,
  "completed_at": null,
  "adw_id": null,
  "result": null,
  "error": null
}
```

**Error Response**: `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": {
    "title": "Title is required",
    "description": "Description is required"
  }
}
```

---

### 4. Claim Task (POST)

**Endpoint**: `POST /api/tasks/kotadb/{task_id}/claim`

**Purpose**: Claim a pending task (transition to `claimed` status)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Request Body**:
```json
{
  "adw_id": "abc12345",
  "worktree": "feat-rate-limiting"
}
```

**Required Fields**:
- `adw_id` (string, ADW execution ID)

**Optional Fields**:
- `worktree` (string, worktree name used for execution)

**Response**: `200 OK`
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting middleware",
  "status": "claimed",
  "claimed_at": "2025-10-11T14:22:15Z",
  "adw_id": "abc12345",
  "worktree": "feat-rate-limiting"
}
```

**Error Response**: `409 Conflict` (already claimed)
```json
{
  "error": "Task already claimed",
  "task_id": "task-001",
  "claimed_at": "2025-10-11T14:20:00Z",
  "adw_id": "xyz98765"
}
```

**Error Response**: `400 Bad Request` (invalid status transition)
```json
{
  "error": "Cannot claim task with status 'completed'",
  "task_id": "task-001",
  "current_status": "completed"
}
```

---

### 5. Start Task (POST)

**Endpoint**: `POST /api/tasks/kotadb/{task_id}/start`

**Purpose**: Mark task as in progress (transition from `claimed` to `in_progress`)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Request Body**:
```json
{
  "adw_id": "abc12345"
}
```

**Response**: `200 OK`
```json
{
  "task_id": "task-001",
  "status": "in_progress",
  "adw_id": "abc12345"
}
```

**Error Response**: `400 Bad Request`
```json
{
  "error": "Cannot start task with status 'pending'. Must be claimed first.",
  "task_id": "task-001",
  "current_status": "pending"
}
```

---

### 6. Complete Task (POST)

**Endpoint**: `POST /api/tasks/kotadb/{task_id}/complete`

**Purpose**: Mark task as completed with result data

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Request Body**:
```json
{
  "adw_id": "abc12345",
  "commit_hash": "a1b2c3d4e",
  "worktree": "feat-rate-limiting",
  "result": {
    "files_changed": 5,
    "lines_added": 247,
    "lines_removed": 18,
    "tests_passed": true,
    "plan_path": "specs/plan-abc12345.md"
  }
}
```

**Required Fields**:
- `adw_id` (string, ADW execution ID)

**Optional Fields**:
- `commit_hash` (string, git commit hash)
- `worktree` (string, worktree name used)
- `result` (object, arbitrary result data)

**Response**: `200 OK`
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting middleware",
  "status": "completed",
  "completed_at": "2025-10-11T14:45:30Z",
  "adw_id": "abc12345",
  "result": {
    "files_changed": 5,
    "lines_added": 247,
    "lines_removed": 18,
    "tests_passed": true,
    "plan_path": "specs/plan-abc12345.md"
  }
}
```

**Error Response**: `404 Not Found`
```json
{
  "error": "Task not found",
  "task_id": "task-001"
}
```

---

### 7. Fail Task (POST)

**Endpoint**: `POST /api/tasks/kotadb/{task_id}/fail`

**Purpose**: Mark task as failed with error information

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Request Body**:
```json
{
  "adw_id": "abc12345",
  "error": "Claude Code error: Failed to create plan file. Permission denied.",
  "worktree": "feat-rate-limiting"
}
```

**Required Fields**:
- `adw_id` (string, ADW execution ID)
- `error` (string, error message or description)

**Optional Fields**:
- `worktree` (string, worktree name used)

**Response**: `200 OK`
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting middleware",
  "status": "failed",
  "completed_at": "2025-10-11T14:45:30Z",
  "adw_id": "abc12345",
  "error": "Claude Code error: Failed to create plan file. Permission denied."
}
```

---

### 8. Update Task (PATCH)

**Endpoint**: `PATCH /api/tasks/kotadb/{task_id}`

**Purpose**: Update arbitrary task fields (general-purpose update)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Request Body** (all fields optional, only include what should be updated):
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "priority": "high",
  "tags": {
    "model": "opus"
  },
  "worktree": "new-worktree-name"
}
```

**Response**: `200 OK` (returns full updated task)

**Error Response**: `400 Bad Request`
```json
{
  "error": "Cannot update status directly. Use /claim, /start, /complete, or /fail endpoints."
}
```

---

### 9. Report Trigger Stats (POST)

**Endpoint**: `POST /api/kota-tasks/stats`

**Purpose**: Receive periodic statistics reports from ADW triggers for monitoring and alerting

**Request Body**:
```json
{
  "trigger_id": "kota-trigger-hostname-20251013142530",
  "hostname": "jaymins-mac-pro",
  "stats": {
    "checks": 42,
    "tasks_started": 12,
    "worktrees_created": 8,
    "homeserver_updates": 15,
    "errors": 0,
    "uptime_seconds": 3600,
    "last_check": "14:32:15",
    "active_workflows": 2
  },
  "timestamp": "2025-10-13T14:32:15.123456"
}
```

**Required Fields**:
- `trigger_id` (string, unique trigger identifier)
- `hostname` (string, hostname where trigger is running)
- `stats` (object, statistics dictionary)
- `timestamp` (string, ISO 8601 timestamp)

**Response**: `200 OK`
```json
{
  "status": "received",
  "trigger_id": "kota-trigger-hostname-20251013142530"
}
```

**Error Response**: `500 Internal Server Error`
```json
{
  "error": "Failed to store stats",
  "details": "Database connection error"
}
```

**Notes**:
- Stats reports are sent periodically (default: every 60 seconds)
- Triggers continue operating even if stats reporting fails
- Home server can use stats for health monitoring and alerting
- `uptime_seconds` calculated from trigger start time
- `active_workflows` shows currently running tasks

---

### 10. Delete Task (DELETE)

**Endpoint**: `DELETE /api/tasks/kotadb/{task_id}`

**Purpose**: Delete a task (soft or hard delete, implementation choice)

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | Unique task identifier |

**Response**: `204 No Content` (successful deletion, no body)

**Error Response**: `404 Not Found`
```json
{
  "error": "Task not found",
  "task_id": "task-001"
}
```

---

## Data Models

### Task Object (Complete)

```typescript
interface Task {
  // Identifiers
  task_id: string;                    // Unique identifier (UUID or incremental)

  // Content
  title: string;                      // Short task title (1-200 chars)
  description: string;                // Detailed description (1-5000 chars)

  // Status & Lifecycle
  status: "pending" | "claimed" | "in_progress" | "completed" | "failed";
  created_at: string;                 // ISO 8601 timestamp
  claimed_at: string | null;          // ISO 8601 timestamp (when claimed)
  completed_at: string | null;        // ISO 8601 timestamp (when completed/failed)

  // Metadata
  priority: "low" | "medium" | "high" | null;
  tags: Record<string, string>;       // Arbitrary key-value metadata

  // Execution Context
  worktree: string | null;            // Git worktree name (auto-gen if null)
  adw_id: string | null;              // ADW execution ID (set on claim)

  // Results
  result: Record<string, any> | null; // Arbitrary result data (set on complete)
  error: string | null;               // Error message (set on fail)
}
```

### Common Tag Keys (Convention)

```typescript
interface TaskTags {
  model?: "sonnet" | "opus";          // Preferred Claude model
  workflow?: "simple" | "complex";    // Workflow type
  repository?: string;                // Target repository (if multi-repo)
  assignee?: string;                  // Human assignee (if HIL)
}
```

### Result Object (Convention)

```typescript
interface TaskResult {
  commit_hash?: string;               // Git commit hash
  files_changed?: number;             // Number of files modified
  lines_added?: number;               // Lines added
  lines_removed?: number;             // Lines removed
  tests_passed?: boolean;             // Test suite result
  plan_path?: string;                 // Path to generated plan (complex workflow)
  duration_seconds?: number;          // Execution duration
}
```

---

## Status Transitions

### Valid State Transitions

```
pending → claimed → in_progress → completed
                                → failed

pending → failed  (error before claiming)
claimed → failed  (error before starting work)
```

### Invalid Transitions (Return 400 Bad Request)

```
completed → *  (completed tasks are terminal)
failed → *     (failed tasks are terminal)
pending → completed  (must be claimed first)
pending → in_progress  (must be claimed first)
```

### Status Transition Matrix

| Current Status | Can Claim? | Can Start? | Can Complete? | Can Fail? |
|----------------|------------|------------|---------------|-----------|
| pending        | ✅ Yes     | ❌ No      | ❌ No         | ✅ Yes    |
| claimed        | ❌ No      | ✅ Yes     | ✅ Yes        | ✅ Yes    |
| in_progress    | ❌ No      | ❌ No      | ✅ Yes        | ✅ Yes    |
| completed      | ❌ No      | ❌ No      | ❌ No         | ❌ No     |
| failed         | ❌ No      | ❌ No      | ❌ No         | ❌ No     |

---

## Error Handling

### Standard Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  },
  "timestamp": "2025-10-11T14:30:00Z"
}
```

### HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful GET, POST, PATCH |
| 201 | Created | Successful task creation |
| 204 | No Content | Successful deletion |
| 400 | Bad Request | Validation error, invalid transition |
| 404 | Not Found | Task doesn't exist |
| 409 | Conflict | Task already claimed |
| 500 | Internal Server Error | Database error, unexpected failure |

---

## Example Requests

### Example 1: Fetch Pending Tasks
```bash
curl -X GET "https://<YOUR_HOMESERVER>.ts.net/api/tasks/kotadb?status=pending&limit=5"
```

**Response**:
```json
[
  {
    "task_id": "task-001",
    "title": "Add rate limiting",
    "description": "Implement tier-based rate limiting...",
    "status": "pending",
    "priority": "high",
    "tags": {"model": "sonnet", "workflow": "complex"},
    "worktree": null,
    "created_at": "2025-10-11T10:30:00Z",
    "claimed_at": null,
    "completed_at": null,
    "adw_id": null,
    "result": null,
    "error": null
  }
]
```

---

### Example 2: Claim Task
```bash
curl -X POST "https://<YOUR_HOMESERVER>.ts.net/api/tasks/kotadb/task-001/claim" \
  -H "Content-Type: application/json" \
  -d '{
    "adw_id": "abc12345",
    "worktree": "feat-rate-limiting"
  }'
```

**Response**:
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting",
  "status": "claimed",
  "claimed_at": "2025-10-11T14:22:15Z",
  "adw_id": "abc12345",
  "worktree": "feat-rate-limiting"
}
```

---

### Example 3: Complete Task
```bash
curl -X POST "https://<YOUR_HOMESERVER>.ts.net/api/tasks/kotadb/task-001/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "adw_id": "abc12345",
    "commit_hash": "a1b2c3d4e",
    "worktree": "feat-rate-limiting",
    "result": {
      "files_changed": 5,
      "lines_added": 247,
      "tests_passed": true,
      "plan_path": "specs/plan-abc12345.md"
    }
  }'
```

**Response**:
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting",
  "status": "completed",
  "completed_at": "2025-10-11T14:45:30Z",
  "adw_id": "abc12345",
  "result": {
    "files_changed": 5,
    "lines_added": 247,
    "tests_passed": true,
    "plan_path": "specs/plan-abc12345.md"
  }
}
```

---

### Example 4: Fail Task
```bash
curl -X POST "https://<YOUR_HOMESERVER>.ts.net/api/tasks/kotadb/task-001/fail" \
  -H "Content-Type: application/json" \
  -d '{
    "adw_id": "abc12345",
    "error": "Planning phase failed: Could not parse requirements",
    "worktree": "feat-rate-limiting"
  }'
```

**Response**:
```json
{
  "task_id": "task-001",
  "status": "failed",
  "completed_at": "2025-10-11T14:45:30Z",
  "adw_id": "abc12345",
  "error": "Planning phase failed: Could not parse requirements"
}
```

---

### Example 5: Create New Task
```bash
curl -X POST "https://<YOUR_HOMESERVER>.ts.net/api/tasks/kotadb" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix typo in README",
    "description": "Change indexng to indexing on line 42",
    "priority": "low",
    "tags": {
      "model": "sonnet",
      "workflow": "simple"
    }
  }'
```

**Response**:
```json
{
  "task_id": "task-002",
  "title": "Fix typo in README",
  "description": "Change indexng to indexing on line 42",
  "status": "pending",
  "priority": "low",
  "tags": {"model": "sonnet", "workflow": "simple"},
  "worktree": null,
  "created_at": "2025-10-11T15:00:00Z",
  "claimed_at": null,
  "completed_at": null,
  "adw_id": null,
  "result": null,
  "error": null
}
```

---

## Database Schema

### Recommended Table Structure (PostgreSQL)

```sql
CREATE TABLE kota_tasks (
    -- Identifiers
    task_id VARCHAR(50) PRIMARY KEY,

    -- Content
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,

    -- Status & Lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    priority VARCHAR(10),
    tags JSONB DEFAULT '{}',

    -- Execution Context
    worktree VARCHAR(100),
    adw_id VARCHAR(50),

    -- Results
    result JSONB,
    error TEXT,

    -- Indexes
    CONSTRAINT check_status CHECK (status IN ('pending', 'claimed', 'in_progress', 'completed', 'failed')),
    CONSTRAINT check_priority CHECK (priority IN ('low', 'medium', 'high') OR priority IS NULL)
);

-- Indexes for common queries
CREATE INDEX idx_kota_tasks_status ON kota_tasks(status);
CREATE INDEX idx_kota_tasks_priority ON kota_tasks(priority);
CREATE INDEX idx_kota_tasks_created_at ON kota_tasks(created_at DESC);
CREATE INDEX idx_kota_tasks_adw_id ON kota_tasks(adw_id);
CREATE INDEX idx_kota_tasks_tags ON kota_tasks USING GIN (tags);
```

### Alternative: SQLite Schema

```sql
CREATE TABLE kota_tasks (
    task_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    claimed_at TEXT,
    completed_at TEXT,
    priority TEXT,
    tags TEXT,  -- JSON string
    worktree TEXT,
    adw_id TEXT,
    result TEXT,  -- JSON string
    error TEXT,
    CHECK (status IN ('pending', 'claimed', 'in_progress', 'completed', 'failed')),
    CHECK (priority IN ('low', 'medium', 'high') OR priority IS NULL)
);

CREATE INDEX idx_status ON kota_tasks(status);
CREATE INDEX idx_priority ON kota_tasks(priority);
CREATE INDEX idx_created_at ON kota_tasks(created_at DESC);
CREATE INDEX idx_adw_id ON kota_tasks(adw_id);
```

---

## Implementation Checklist

### Backend Implementation

- [ ] Set up project structure (FastAPI/Express/Flask/etc.)
- [ ] Configure database connection
- [ ] Create `kota_tasks` table with schema
- [ ] Implement GET `/api/tasks/kotadb` (list with filters)
- [ ] Implement GET `/api/tasks/kotadb/{task_id}` (get by ID)
- [ ] Implement POST `/api/tasks/kotadb` (create task)
- [ ] Implement POST `/api/tasks/kotadb/{task_id}/claim` (claim task)
- [ ] Implement POST `/api/tasks/kotadb/{task_id}/start` (start task)
- [ ] Implement POST `/api/tasks/kotadb/{task_id}/complete` (complete task)
- [ ] Implement POST `/api/tasks/kotadb/{task_id}/fail` (fail task)
- [ ] Implement PATCH `/api/tasks/kotadb/{task_id}` (update task)
- [ ] Implement DELETE `/api/tasks/kotadb/{task_id}` (delete task)
- [ ] Implement POST `/api/kota-tasks/stats` (receive trigger stats)
- [ ] Add validation for status transitions
- [ ] Add error handling and consistent error responses
- [ ] Configure CORS (if needed)
- [ ] Test all endpoints with curl/Postman

### Deployment

- [ ] Deploy to jaymins-mac-pro
- [ ] Configure Tailscale
- [ ] Set up HTTPS (Let's Encrypt or self-signed)
- [ ] Configure systemd service (or equivalent)
- [ ] Set up logging
- [ ] Configure backup strategy (if needed)

### Integration Testing

- [ ] Test task creation from home server
- [ ] Test task claiming from KotaDB ADWs
- [ ] Test task completion flow
- [ ] Test task failure flow
- [ ] Test concurrent task processing
- [ ] Test error conditions (already claimed, invalid transitions, etc.)

---

## Technology Recommendations

### Framework Options

**Python (FastAPI)**:
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import sqlite3

app = FastAPI()

@app.get("/api/tasks/kotadb")
async def list_tasks(status: str = None, limit: int = 10):
    # Implementation
    pass
```

**Node.js (Express)**:
```javascript
const express = require('express');
const app = express();

app.get('/api/tasks/kotadb', (req, res) => {
    const { status, limit = 10 } = req.query;
    // Implementation
});
```

**Bun (Hono)**:
```typescript
import { Hono } from 'hono'

const app = new Hono()

app.get('/api/tasks/kotadb', (c) => {
    const status = c.req.query('status')
    const limit = c.req.query('limit') || 10
    // Implementation
})
```

### Database Options

1. **SQLite** (simplest, file-based)
   - Good for: Single server, low concurrency
   - Setup: `pip install sqlite3` (Python) or built-in (Node/Bun)

2. **PostgreSQL** (recommended for production)
   - Good for: Multi-server, high concurrency, JSONB queries
   - Setup: Docker container or native install

3. **Supabase** (managed PostgreSQL)
   - Good for: Quick setup, built-in API
   - Note: May not be needed if building custom API

---

## Security Considerations

### Network Security
- ✅ Tailscale provides encrypted tunnel
- ✅ No public internet exposure
- ✅ No authentication needed (trusted network)

### Input Validation
- ⚠️ Validate all user inputs (title, description lengths)
- ⚠️ Sanitize task descriptions (prevent injection attacks)
- ⚠️ Validate status transitions (business logic enforcement)

### Rate Limiting (Optional)
- Consider rate limiting at API level (e.g., 100 req/min per client)
- Prevents accidental DDoS from misconfigured ADWs trigger

---

## Future Enhancements

### Optional Features (V2)

1. **Task History Log**
   - Track all status changes with timestamps
   - Table: `kota_task_history` (task_id, from_status, to_status, changed_at, changed_by)

2. **Task Comments**
   - Allow human annotations on tasks
   - Table: `kota_task_comments` (comment_id, task_id, content, created_at)

3. **Task Templates**
   - Pre-defined task templates for common operations
   - Table: `kota_task_templates` (template_id, title, description, tags)

4. **Task Dependencies**
   - Tasks that depend on other tasks completing first
   - Table: `kota_task_dependencies` (task_id, depends_on_task_id)

5. **Webhook Notifications**
   - Push notifications to external systems on task events
   - POST to configured webhook URLs on status changes

6. **Task Scheduling**
   - Schedule tasks for future execution
   - Field: `scheduled_for TIMESTAMP`

7. **Multi-Repository Support**
   - Support tasks across multiple repositories
   - Field: `repository VARCHAR(100)`

---

**End of API Specification**
