# Memory Layer Guide

> New in v2.2.0

## Overview

The Memory Layer provides persistent cross-session intelligence, enabling agents to learn from past decisions, avoid repeating mistakes, and follow established patterns. All data is stored locally in SQLite with FTS5 full-text search.

## Architecture

### Core Concept

The Memory Layer creates a persistent knowledge base that survives session boundaries:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Session A  │───▶│   Memory    │◀───│  Session B  │
│   Agent     │    │   Layer     │    │   Agent     │
└─────────────┘    └─────────────┘    └─────────────┘
                           │
                    ┌─────────────┐
                    │   SQLite    │
                    │  + FTS5     │
                    └─────────────┘
```

### Database Tables

| Table | Purpose | Search Tool |
|-------|---------|-------------|
| `decisions` | Architectural decisions with rationale | `search_decisions` |
| `failures` | Failed approaches to avoid repetition | `search_failures` |
| `patterns` | Codebase conventions and patterns | `search_patterns` |
| `insights` | Session discoveries and workarounds | (automatic) |
| `agent_sessions` | Track agent work for learning | (internal) |

## Core Features

### 1. Decision Recording

Capture architectural decisions with full context:

```json
{
  "tool": "record_decision",
  "parameters": {
    "title": "Use SQLite for local storage",
    "context": "Need persistent storage for indexed code files without external dependencies",
    "decision": "Use SQLite with FTS5 for embedded database and full-text search",
    "scope": "architecture",
    "rationale": "SQLite is embedded, requires no setup, and FTS5 provides excellent search performance",
    "alternatives": ["PostgreSQL", "LevelDB", "File-based JSON"],
    "related_files": ["src/db/sqlite/index.ts", "src/db/migrations/"]
  }
}
```

### 2. Failure Recording

Document failed approaches to prevent repetition:

```json
{
  "tool": "record_failure",
  "parameters": {
    "title": "Recursive import resolution caused stack overflow",
    "problem": "Resolving deeply nested import chains in large codebases",
    "approach": "Used recursive function without depth limit or cycle detection",
    "failure_reason": "Stack overflow on circular dependencies exceeding 1000 levels",
    "related_files": ["src/indexer/resolver.ts"]
  }
}
```

### 3. Pattern Discovery

Search and understand codebase patterns:

```json
{
  "tool": "search_patterns",
  "parameters": {
    "pattern_type": "error-handling",
    "limit": 10
  }
}
```

### 4. Intelligent Search

Find relevant past decisions and failures:

```json
{
  "tool": "search_decisions",
  "parameters": {
    "query": "database migration strategy",
    "scope": "architecture",
    "limit": 5
  }
}
```

## Usage Patterns

### Pre-Work Context

Before starting work, agents search memory for relevant context:

```python
# pre-work-context.py
import subprocess
import json

def get_memory_context(task_description, related_files):
    # Search for relevant decisions
    decisions = search_memory("search_decisions", task_description)

    # Check for past failures
    failures = search_memory("search_failures", task_description)

    # Find relevant patterns
    patterns = search_memory("search_patterns",
                           {"file": related_files[0] if related_files else None})

    return {
        "decisions": decisions,
        "failures": failures,
        "patterns": patterns
    }
```

### Post-Work Recording

After completing work, agents record insights:

```python
# post-work-recording.py
def record_session_outcome(session_type, outcome, insights):
    if outcome == "success":
        # Record successful decision
        record_decision({
            "title": f"Successful {session_type}",
            "context": insights.get("context"),
            "decision": insights.get("approach"),
            "rationale": insights.get("reasoning")
        })
    elif outcome == "failure":
        # Record failed approach
        record_failure({
            "title": f"Failed {session_type}",
            "problem": insights.get("problem"),
            "approach": insights.get("approach"),
            "failure_reason": insights.get("error")
        })
```

### Learning Workflows

Agents can learn from memory across sessions:

```python
# learning-workflow.py
def plan_refactoring(target_files):
    # Search for past refactoring decisions
    past_decisions = search_decisions("refactoring " + " ".join(target_files))

    # Check for refactoring failures
    past_failures = search_failures("refactoring")

    # Get current patterns in target files
    current_patterns = []
    for file in target_files:
        patterns = search_patterns({"file": file})
        current_patterns.extend(patterns)

    return create_refactoring_plan(past_decisions, past_failures, current_patterns)
```

## Integration Patterns

### With Agent Workflows

Memory Layer integrates with all agent types:

#### API Agents
```yaml
# api-build-agent.yaml
memory_integration:
  pre_work:
    - search_decisions: "API design patterns"
    - search_patterns: "endpoint validation"
  post_work:
    - record_decision: "API endpoint structure"
```

#### Database Agents
```yaml
# database-build-agent.yaml
memory_integration:
  pre_work:
    - search_decisions: "migration strategy"
    - search_failures: "schema changes"
  post_work:
    - record_decision: "Migration approach"
```

### With Claude Code Hooks

Automatic memory integration through hooks:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "command": "memory-context.py",
        "env": {
          "KOTADB_MEMORY_SCOPE": "relevant"
        }
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "command": "memory-record.py",
        "env": {
          "KOTADB_MEMORY_MODE": "insights"
        }
      }
    ]
  }
}
```

## Memory Categories

### Decision Scopes

| Scope | Use Case | Examples |
|-------|----------|----------|
| `architecture` | High-level system decisions | Database choice, framework selection |
| `pattern` | Code pattern decisions | Error handling, logging patterns |
| `convention` | Team conventions | Naming, structure, formatting |
| `workaround` | Temporary solutions | Bug fixes, compatibility hacks |

### Failure Types

Common failure patterns to record:

- **Performance failures**: Approaches that didn't scale
- **Integration failures**: Library/framework incompatibilities
- **Architecture failures**: Design decisions that didn't work
- **Implementation failures**: Code patterns that caused issues

### Pattern Types

Discoverable pattern categories:

- **error-handling**: How errors are handled
- **api-call**: API interaction patterns
- **data-validation**: Input validation approaches
- **testing**: Test organization and patterns
- **logging**: Logging and monitoring patterns

## Advanced Features

### Cross-Repository Learning

Memory Layer works across multiple repositories:

```json
{
  "tool": "search_decisions",
  "parameters": {
    "query": "microservice communication",
    "repository": null,  // Search all repositories
    "limit": 20
  }
}
```

### Pattern Confidence Scoring

Patterns build confidence through evidence:

```json
{
  "pattern": "Always validate API inputs with Zod schemas",
  "confidence": 0.95,
  "evidence_count": 23,
  "last_observed": "2026-02-04T10:30:00Z"
}
```

### Session Correlation

Track related work across sessions:

```json
{
  "session_id": "refactor-auth-2026-02-04",
  "related_sessions": [
    "auth-middleware-2026-01-15",
    "jwt-implementation-2026-01-20"
  ]
}
```

## Configuration

### Memory Settings

Configure memory behavior in `.kotadb/memory-config.json`:

```json
{
  "retention_policy": {
    "decisions": "permanent",
    "failures": "1_year",
    "patterns": "permanent",
    "insights": "6_months"
  },
  "confidence_thresholds": {
    "pattern_acceptance": 0.7,
    "decision_relevance": 0.5
  },
  "auto_recording": {
    "enabled": true,
    "session_insights": true,
    "pattern_discovery": true
  }
}
```

### Privacy Controls

Memory data stays local with optional filtering:

```json
{
  "privacy": {
    "exclude_patterns": ["password", "secret", "token"],
    "anonymize_paths": true,
    "exclude_file_patterns": ["*.env", "credentials/*"]
  }
}
```

## Performance

### Search Performance

- **FTS5 indexing**: Full-text search across all memory tables
- **Response time**: <50ms for typical queries
- **Concurrent access**: SQLite WAL mode for multiple readers

### Storage Efficiency

- **Compression**: Automatic SQLite compression
- **Deduplication**: Prevent duplicate patterns and decisions
- **Cleanup**: Configurable retention policies

### Memory Usage

- **Lazy loading**: Load memory data on demand
- **Caching**: Frequently accessed patterns cached in memory
- **Streaming**: Large result sets streamed to prevent memory issues

## Best Practices

### Decision Recording

1. **Be specific**: Include concrete context and reasoning
2. **Document alternatives**: Explain why other options were rejected
3. **Link to files**: Connect decisions to relevant code
4. **Update status**: Mark decisions as superseded when changed

### Failure Recording

1. **Include reproduction steps**: Help future agents understand the issue
2. **Document the fix**: If you found a solution, record it
3. **Categorize properly**: Use consistent failure types
4. **Link to related code**: Connect failures to specific files

### Pattern Discovery

1. **Validate patterns**: Ensure patterns are actually followed
2. **Update confidence**: Review and update pattern confidence scores
3. **Remove obsolete patterns**: Clean up patterns that are no longer valid
4. **Document exceptions**: Note when patterns don't apply

### Memory Hygiene

1. **Regular cleanup**: Remove outdated decisions and patterns
2. **Review accuracy**: Periodically validate recorded information
3. **Merge duplicates**: Consolidate similar decisions or patterns
4. **Update relationships**: Maintain connections between related entries

## Troubleshooting

### No Memory Results

```bash
# Check memory layer status
bunx kotadb memory-status

# Rebuild FTS5 indexes
bunx kotadb memory-reindex

# Check for data
bunx kotadb memory-stats
```

### Slow Memory Queries

- Use more specific search terms
- Filter by repository or scope
- Check FTS5 index status
- Consider memory data cleanup

### Inconsistent Patterns

- Review pattern confidence scores
- Check for conflicting evidence
- Update obsolete patterns
- Validate against current codebase

## Migration and Backup

### Export Memory Data

```bash
# Export all memory data
bunx kotadb memory-export --format jsonl --output .kotadb/memory-backup.jsonl

# Export specific categories
bunx kotadb memory-export --categories decisions,patterns
```

### Import Memory Data

```bash
# Import from backup
bunx kotadb memory-import --input .kotadb/memory-backup.jsonl

# Import from another project
bunx kotadb memory-import --input ../other-project/.kotadb/memory-backup.jsonl --merge
```

### Cross-Team Sharing

Share curated memory data across teams:

```bash
# Export public decisions only
bunx kotadb memory-export --scope architecture --public-only

# Import team standards
bunx kotadb memory-import --input team-standards.jsonl --category patterns
```

## Next Steps

- Start recording decisions and failures in your daily work
- Set up hooks for automatic memory integration
- Explore pattern discovery in your existing codebase
- Configure retention policies for your team's needs
- Review the Unified Search Guide for memory-aware search capabilities