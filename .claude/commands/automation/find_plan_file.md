# /find_plan_file

**Template Category**: Path Resolution

Determine the relative path to the plan file created in the previous step.

## Instructions
- Inspect git for newly created or modified files under `docs/specs/`.
- You may use:
  - `git status --short docs/specs/`
  - `git diff --name-only origin/develop...HEAD docs/specs/`
  - `ls -t docs/specs/`

## CRITICAL: Output Format Requirements

Return **ONLY** the plan file path as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The plan file is located at:", "Based on the output:")
- Markdown formatting or code blocks (no ``` backticks)
- Quotes, asterisks, or other punctuation around the path
- Multiple lines or additional commentary

**Correct output:**
```
docs/specs/feature-1234-event-streaming.md
```

**INCORRECT outputs (do NOT do this):**
```
Based on the git status output, the plan file path is:

**docs/specs/feature-1234-event-streaming.md**
```

```
The plan file is located at: docs/specs/feature-1234-event-streaming.md
```

If no plan file can be found, respond with only:
```
0
```

## Previous Output

$ARGUMENTS
