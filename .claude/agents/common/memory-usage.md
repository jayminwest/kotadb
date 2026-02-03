# Memory Layer Usage Guide

This guide covers how agents use the memory layer tools for cross-session learning.

## Overview

The memory layer provides persistent storage for:
- **Decisions**: Architectural choices with rationale
- **Failures**: Approaches that didn't work and why
- **Patterns**: Discovered code patterns for consistency
- **Insights**: Workarounds and discoveries

## Tools Reference

### Search Tools (Read-Only)

#### search_decisions
Find past architectural decisions.
```
search_decisions(
  query: "search terms",
  scope?: "architecture|pattern|convention|workaround",
  limit?: 20
)
```

#### search_failures
Find past failed approaches.
```
search_failures(
  query: "search terms",
  limit?: 20
)
```

#### search_patterns
Find discovered code patterns.
```
search_patterns(
  query?: "search terms",
  pattern_type?: "error-handling|api-call|...",
  limit?: 20
)
```

### Recording Tools (Write)

#### record_decision
Record an architectural decision.
```
record_decision(
  title: "Decision title",
  context: "Background and problem",
  decision: "What was decided",
  rationale?: "Why this approach",
  scope?: "architecture|pattern|convention|workaround",
  alternatives?: ["other options considered"],
  related_files?: ["file paths"]
)
```

#### record_failure
Record a failed approach.
```
record_failure(
  title: "Failure title",
  problem: "What was being solved",
  approach: "What was tried",
  failure_reason: "Why it failed",
  related_files?: ["file paths"]
)
```

#### record_insight
Record a discovery or workaround.
```
record_insight(
  content: "The insight",
  insight_type: "discovery|failure|workaround",
  related_file?: "file path"
)
```

## Usage Patterns

### Before Implementation (Build Agents)

1. Search for relevant failures to avoid:
   ```
   search_failures("feature you're implementing")
   ```

2. Search for relevant decisions to follow:
   ```
   search_decisions("architectural area")
   ```

3. Search for patterns to maintain consistency:
   ```
   search_patterns(pattern_type: "relevant-type")
   ```

### During Implementation

- When making architectural choices → `record_decision`
- When an approach fails → `record_failure`
- When finding workarounds → `record_insight`

### After Analysis (Improve Agents)

1. Analyze git changes for patterns
2. Record significant decisions found
3. Record any failed approaches discovered
4. Record insights and workarounds

## Best Practices

### What to Record

**DO record:**
- Decisions affecting multiple files
- Decisions others might need to follow
- Failed approaches others might try
- Non-obvious workarounds
- Performance insights

**DON'T record:**
- Trivial implementation details
- Temporary debugging info
- Personal preferences
- Incomplete experiments

### Search Effectively

- Use specific keywords from the task
- Search by file path components
- Search by technology (e.g., "FTS5", "MCP")
- Check multiple related terms

### Recording Quality

- Titles should be descriptive and searchable
- Context should explain "why" not just "what"
- Include file paths for traceability
- Be concise but complete
