# /classify_issue

**Template Category**: Message-Only

Based on the GitHub issue payload below, choose the correct slash command. Respond with exactly one token: `/feature`, `/bug`, `/chore`, or `0` if none apply.

## Guidance
- `/feature`: net-new capability or enhancement delivering user value.
- `/bug`: incorrect behaviour, regressions, failing tests, or outages.
- `/chore`: maintenance, refactors, dependency upgrades, tooling changes, docs-only work.
- `0`: insufficient info or out-of-scope for automation.

Think carefully about impact, urgency, and deliverables described in the issue before answering.

## Output Schema

The output must match this pattern:
- Type: string
- Enum: `/feature`, `/bug`, `/chore`, `0`
- Format: Single line, no whitespace, no explanatory text

**Correct outputs:**
```
/feature
```
```
/bug
```
```
/chore
```
```
0
```

**INCORRECT outputs (do NOT do this):**
```
This issue should be classified as: /feature
```
```
Based on the issue description, I recommend /chore
```

## GitHub Issue

$ARGUMENTS
