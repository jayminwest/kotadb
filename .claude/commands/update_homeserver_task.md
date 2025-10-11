# /update_homeserver_task

Update the status of a task on the home server API.

## Inputs
- `$1` (task_id): Unique task identifier (e.g., "task-001")
- `$2` (status): New status for the task (one of: "pending", "claimed", "in_progress", "completed", "failed")
- `$3` (update_content_json): JSON object containing additional update fields

## Instructions

1. Use the WebFetch tool to make a POST request to update the task status
2. Construct the full URL: `{base_url}/api/kota-tasks/{task_id}`
3. Parse the update_content_json to extract fields like:
   - `adw_id`: ADW execution ID
   - `worktree`: Worktree name used for the task
   - `commit_hash`: Git commit hash if the task was successful
   - `error`: Error message if the task failed
   - `timestamp`: ISO timestamp of the update
4. Send the update payload as JSON in the request body
5. Return a success confirmation message

## Update Payload Structure

```json
{
  "status": "completed",
  "adw_id": "abc123",
  "worktree": "feat-rate-limiting",
  "commit_hash": "a1b2c3d4",
  "timestamp": "2025-10-11T15:45:00Z"
}
```

For failed tasks:
```json
{
  "status": "failed",
  "adw_id": "abc123",
  "worktree": "feat-rate-limiting",
  "error": "Build failed: type errors in src/api/routes.ts",
  "timestamp": "2025-10-11T15:45:00Z"
}
```

## Expected Output

Return a concise success message:
```
Task task-001 updated to status: completed
```

## Error Handling

If the update fails:
- Log the error message to stderr
- Return an error message indicating the failure
- Include the task_id and attempted status in the error message
