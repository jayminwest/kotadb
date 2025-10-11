# /get_homeserver_tasks

Fetch eligible tasks from the home server API endpoint.

## Inputs
- `$1` (base_url): Base URL of the home server (e.g., https://jaymins-mac-pro.tail1b7f44.ts.net)
- `$2` (status_filter_json): JSON array of task statuses to fetch (e.g., ["pending"])
- `$3` (limit): Maximum number of tasks to fetch (e.g., 3)

## Instructions

1. Use the WebFetch tool to make a GET request to the home server tasks endpoint
2. Construct the full URL: `{base_url}/api/kota-tasks`
3. Include query parameters: `status={status_filter}&limit={limit}`
4. Parse the JSON response and validate the structure
5. Ensure each task has required fields: `task_id`, `title`, `description`, `status`

## Expected Response Format

Return a JSON array of task objects. Each task must have:
- `task_id` (string): Unique task identifier
- `title` (string): Short task title
- `description` (string): Detailed task description
- `status` (string): Current task status
- `tags` (object, optional): Metadata tags for model, workflow, etc.
- `created_at` (string): ISO timestamp of creation

## Example Output

```json
[
  {
    "task_id": "task-001",
    "title": "Add rate limiting",
    "description": "Implement tier-based rate limiting for API endpoints",
    "status": "pending",
    "tags": {
      "model": "sonnet",
      "workflow": "complex"
    },
    "created_at": "2025-10-11T14:30:00Z"
  }
]
```

## Error Handling

If the request fails or the home server is unreachable:
- Return an empty array `[]`
- Log the error message to stderr
- Do not throw exceptions or halt execution
