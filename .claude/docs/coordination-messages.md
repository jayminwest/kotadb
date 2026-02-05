# Coordination Messages

Standardized message formats for agent-to-agent communication and orchestration in KotaDB's multi-agent system.

## Overview

Coordination messages enable structured communication between agents, orchestrators, and the system. All messages follow JSON Schema validation (`.claude/schemas/coordination-messages.schema.json`) to ensure consistency and machine-readability.

## Message Types

### 1. Task Assignment

Sent from orchestrator to worker agent when delegating a task.

```json
{
  "type": "task_assignment",
  "from": "orchestrator-agent",
  "to": "worker-agent",
  "timestamp": "2026-02-05T10:30:00Z",
  "content": {
    "taskId": "task-001",
    "agentName": "database-build-agent",
    "objective": "Implement user authentication migration",
    "context": {
      "issue": "#123",
      "spec": "/path/to/spec.md",
      "dependencies": ["users table", "sessions table"]
    },
    "constraints": [
      "Must be backwards compatible",
      "Include rollback migration"
    ]
  }
}
```

**Fields:**
- `taskId`: Unique identifier for tracking
- `agentName`: Target agent to execute task
- `objective`: Clear, concise task description (max 200 chars)
- `context`: Relevant information for task execution
  - `issue`: GitHub issue number if applicable
  - `spec`: Path to specification file
  - `dependencies`: Related tasks or requirements
- `constraints`: Specific requirements or limitations

### 2. Status Update

Sent from worker to orchestrator during task execution.

```json
{
  "type": "status_update",
  "from": "database-build-agent",
  "to": "orchestrator",
  "timestamp": "2026-02-05T10:35:00Z",
  "content": {
    "taskId": "task-001",
    "status": "in_progress",
    "progress": "Migration schema created, writing up/down functions",
    "blockedBy": null
  }
}
```

**Status Values:**
- `in_progress`: Task is actively being worked on
- `complete`: Task finished successfully
- `blocked`: Task cannot proceed (requires `blockedBy`)
- `failed`: Task encountered unrecoverable error

### 3. Question

Sent from worker to orchestrator when clarification is needed.

```json
{
  "type": "question",
  "from": "database-build-agent",
  "to": "orchestrator",
  "timestamp": "2026-02-05T10:40:00Z",
  "content": {
    "taskId": "task-001",
    "question": "Should password hash use bcrypt or argon2?",
    "context": "Spec doesn't specify hashing algorithm. Both are secure.",
    "options": ["bcrypt", "argon2"]
  }
}
```

**When to Ask:**
- Ambiguous requirements
- Multiple valid approaches
- Security or architectural decisions
- Breaking changes needed

### 4. Worker Result

Sent from worker to orchestrator upon task completion.

```json
{
  "type": "result",
  "from": "database-build-agent",
  "to": "orchestrator",
  "timestamp": "2026-02-05T11:00:00Z",
  "content": {
    "status": "complete",
    "summary": "Created user authentication migration with bcrypt hashing. Includes rollback support and tests.",
    "filesModified": [
      "/Users/user/project/app/src/db/migrations/20260205_add_auth.ts",
      "/Users/user/project/app/tests/db/auth.test.ts"
    ],
    "filesRead": [
      "/Users/user/project/app/src/db/schema.ts",
      "/Users/user/project/.claude/.cache/specs/database/auth-spec.md"
    ],
    "nextSteps": [
      "Run migration on dev database",
      "Test authentication flow end-to-end"
    ]
  }
}
```

**Status-Specific Fields:**

**Complete:**
- `summary`: 1-3 sentences describing what was done
- `filesModified`: Absolute paths to created/modified files
- `filesRead`: Context files referenced
- `nextSteps`: Recommended follow-up actions

**Blocked:**
- `summary`: What was attempted
- `blockedBy`: Clear description of blocker
- `nextSteps`: What could unblock

**Failed:**
- `summary`: What was attempted
- `error`: Error message or failure reason
- `nextSteps`: Suggested recovery actions

## Usage Patterns

### Orchestrator → Worker Flow

1. **Orchestrator** spawns worker via Task tool
2. **Orchestrator** includes task assignment in worker prompt
3. **Worker** parses assignment, executes objective
4. **Worker** sends status updates if task is long-running
5. **Worker** asks questions if clarification needed
6. **Worker** returns result upon completion

### Worker → Worker Communication

Workers can coordinate directly when needed:

```json
{
  "type": "task_assignment",
  "from": "database-plan-agent",
  "to": "database-build-agent",
  "timestamp": "2026-02-05T10:15:00Z",
  "content": {
    "taskId": "task-002",
    "agentName": "database-build-agent",
    "objective": "Implement planned migration from spec-001",
    "context": {
      "spec": "/path/to/spec-001.md",
      "dependencies": []
    }
  }
}
```

## Best Practices

### For Orchestrators

- Generate unique `taskId` values (timestamp-based or UUID)
- Keep objectives under 200 characters
- Provide all necessary context in assignment
- Monitor for questions and respond promptly
- Aggregate results for user reporting

### For Workers

- Parse task assignment at start
- Send status updates for tasks over 2 minutes
- Ask questions early to avoid rework
- Always include absolute file paths in results
- Keep summaries concise (1-3 sentences)
- Provide actionable next steps

### For All Agents

- Use ISO 8601 timestamps
- Include `from` and `to` fields for traceability
- Validate messages against schema before sending
- Log all coordination messages for debugging

## Schema Validation

All messages must validate against `.claude/schemas/coordination-messages.schema.json`. Key constraints:

- `summary`: Max 300 characters
- `objective`: Max 200 characters
- `progress`: Max 200 characters
- `question`: Max 300 characters
- `status`: Must be one of allowed enum values
- Required fields vary by message type

## Error Handling

Invalid messages should be logged but not block operations:

```typescript
try {
  validateMessage(message, schema);
  sendMessage(message);
} catch (error) {
  console.error(`Invalid coordination message: ${error}`);
  // Continue operation with logging
}
```

## Future Enhancements

- Message queue for async coordination
- Priority levels for urgent questions
- Dependency tracking between tasks
- Automatic retry on failure
- Message persistence for auditing

## Related Documentation

- [Context Contracts](./context-contracts.md) - Agent requirement declarations
- [Agent Registry](../agents/agent-registry.json) - Available agents and capabilities
- [Coordination Message Schema](../schemas/coordination-messages.schema.json) - JSON Schema validation
