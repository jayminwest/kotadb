# CLI --toolset Flag Guide

> New in v2.2.0

## Overview

The `--toolset` flag allows you to filter MCP tools by category, enabling focused workflows that expose only relevant tools for specific tasks.

## Basic Usage

```bash
# Start with only database-related tools
bunx kotadb --stdio --toolset database

# Start with search and analysis tools
bunx kotadb --stdio --toolset search,analysis

# Start with memory layer tools only
bunx kotadb --stdio --toolset memory
```

## Available Toolsets

### Core Toolsets

| Toolset | Tools Included | Use Case |
|---------|----------------|----------|
| `search` | `search_code`, `search_dependencies`, `search_unified` | Code discovery and exploration |
| `index` | `index_repository`, `list_recent_files`, `validate_expertise` | Repository indexing and maintenance |
| `analysis` | `analyze_change_impact`, `validate_implementation_spec` | Impact assessment and planning |
| `memory` | `search_decisions`, `record_decision`, `search_failures`, `record_failure`, `search_patterns`, `record_insight` | Cross-session intelligence |
| `sync` | `kota_sync_export`, `kota_sync_import` | Data synchronization |
| `context` | `generate_task_context`, `get_domain_key_files` | Context generation for workflows |

### Domain-Specific Toolsets

| Toolset | Tools Included | Use Case |
|---------|----------------|----------|
| `database` | Database schema, migration, and query tools | Database development |
| `api` | HTTP endpoint and MCP tool development | API development |
| `testing` | Test-related tools and patterns | Test development |
| `indexer` | AST parsing and symbol extraction tools | Indexer development |
| `automation` | Workflow and orchestration tools | Automation development |

### Specialized Toolsets

| Toolset | Tools Included | Use Case |
|---------|----------------|----------|
| `minimal` | `search_code`, `search_dependencies`, `analyze_change_impact` | Lightweight workflows |
| `full` | All available tools (default) | Complete access |
| `debug` | Debug-specific tools with verbose output | Troubleshooting |

## Configuration Patterns

### Project-Specific Toolsets

Configure project-specific toolsets in `.mcp.json`:

```json
{
  "mcpServers": {
    "kotadb-search": {
      "command": "bunx",
      "args": ["kotadb", "--stdio", "--toolset", "search,memory"],
      "env": {
        "KOTADB_LOG_LEVEL": "info"
      }
    },
    "kotadb-full": {
      "command": "bunx",
      "args": ["kotadb", "--stdio", "--toolset", "full"],
      "env": {
        "KOTADB_LOG_LEVEL": "warn"
      }
    }
  }
}
```

### Role-Based Access

Different team roles can use different toolsets:

```bash
# Developer workflow
bunx kotadb --stdio --toolset search,analysis,memory

# DevOps workflow
bunx kotadb --stdio --toolset index,sync,context

# QA workflow
bunx kotadb --stdio --toolset testing,analysis

# Architecture review
bunx kotadb --stdio --toolset memory,analysis,context
```

## Workflow Examples

### Code Review Workflow

```bash
# Start with analysis and memory tools for code review
bunx kotadb --stdio --toolset analysis,memory

# Available tools:
# - analyze_change_impact: Assess PR impact
# - search_decisions: Find related architectural decisions
# - search_failures: Check for similar past failures
# - record_insight: Document review findings
```

### Refactoring Workflow

```bash
# Start with search and context tools for refactoring
bunx kotadb --stdio --toolset search,context,memory

# Available tools:
# - search_dependencies: Understand file relationships
# - search_unified: Find related patterns and decisions
# - generate_task_context: Get refactoring context
# - search_patterns: Follow existing conventions
```

### Database Migration Workflow

```bash
# Start with database-specific tools
bunx kotadb --stdio --toolset database,memory

# Available tools:
# - Database schema tools
# - Migration utilities
# - search_decisions: Find past database decisions
# - record_decision: Document migration rationale
```

## Performance Benefits

### Reduced Tool Loading

- **Faster startup**: Only load necessary tools
- **Lower memory usage**: Smaller tool registry
- **Cleaner interfaces**: Focused tool lists in Claude

### Focused Workflows

- **Reduced cognitive overhead**: Fewer irrelevant tools
- **Better discoverability**: Relevant tools easier to find
- **Workflow consistency**: Teams use same tool subsets

## Environment Variables

Control toolset behavior with environment variables:

```bash
# Set default toolset
export KOTADB_DEFAULT_TOOLSET="search,memory"

# Enable toolset debug mode
export KOTADB_TOOLSET_DEBUG=true

# Strict mode (fail if unknown toolset)
export KOTADB_TOOLSET_STRICT=true
```

## Custom Toolsets

### Defining Custom Toolsets

Create custom toolsets in `.kotadb/toolsets.json`:

```json
{
  "custom_toolsets": {
    "frontend": [
      "search_code",
      "search_patterns",
      "search_dependencies",
      "generate_task_context"
    ],
    "backend": [
      "search_code",
      "analyze_change_impact",
      "search_decisions",
      "database_tools"
    ],
    "docs": [
      "search_unified",
      "search_patterns",
      "record_decision"
    ]
  }
}
```

### Using Custom Toolsets

```bash
# Use custom frontend toolset
bunx kotadb --stdio --toolset frontend

# Combine custom and built-in toolsets
bunx kotadb --stdio --toolset frontend,memory
```

## Advanced Usage

### Dynamic Toolset Switching

For advanced workflows, switch toolsets during runtime:

```python
# Hook: dynamic-toolset.py
import os
import subprocess

def switch_toolset_for_task(task_type):
    toolset_map = {
        'refactor': 'search,context,memory',
        'review': 'analysis,memory',
        'debug': 'search,minimal',
        'docs': 'search,memory'
    }

    toolset = toolset_map.get(task_type, 'full')
    os.environ['KOTADB_DYNAMIC_TOOLSET'] = toolset
```

### Conditional Tool Loading

Load tools based on repository characteristics:

```bash
#!/bin/bash
# smart-toolset.sh

if [ -f "package.json" ]; then
    TOOLSET="search,testing,memory"
elif [ -f "Cargo.toml" ]; then
    TOOLSET="search,analysis,memory"
elif [ -d "docs/" ]; then
    TOOLSET="search,memory,context"
else
    TOOLSET="minimal"
fi

bunx kotadb --stdio --toolset $TOOLSET
```

## Integration with Claude Code

### Hooks Configuration

Configure hooks to use appropriate toolsets:

```json
{
  "hooks": {
    "PreEdit": [
      {
        "command": "kotadb-context-with-toolset.py",
        "env": {
          "KOTADB_TOOLSET": "context,memory"
        }
      }
    ]
  }
}
```

### Agent-Specific Toolsets

Different agent types can use different toolsets:

```yaml
# build-agent.yaml
toolset: "index,analysis,memory"

# test-agent.yaml
toolset: "testing,search,memory"

# review-agent.yaml
toolset: "analysis,memory,context"
```

## Troubleshooting

### Unknown Toolset Error

```bash
Error: Unknown toolset 'typo'
Available toolsets: search, index, analysis, memory, sync, context, minimal, full
```

**Solution**: Check spelling or define custom toolset.

### Missing Expected Tool

```bash
Error: Tool 'search_unified' not available in current toolset
```

**Solution**: Add 'search' toolset or use 'full' toolset.

### Performance Issues

If startup is still slow with filtered toolsets:

1. Use `minimal` toolset for basic workflows
2. Check for `--toolset debug` mode
3. Verify index status with `bunx kotadb status`

## Best Practices

### Team Standards

1. **Standardize toolsets** for common workflows
2. **Document toolset choices** in project README
3. **Use role-based toolsets** for different team members
4. **Test workflows** with minimal toolsets first

### Performance Optimization

1. **Start minimal** and add tools as needed
2. **Use environment variables** for consistent defaults
3. **Profile startup time** with different toolsets
4. **Cache frequently used combinations**

### Workflow Design

1. **Map workflows to toolsets** during team planning
2. **Create custom toolsets** for repetitive tasks
3. **Use hooks** to automatically select appropriate toolsets
4. **Document toolset rationale** in decision records

## Migration Guide

### From v2.1.x

In v2.1.x, all tools were always loaded:

```bash
# Old way - all tools loaded
bunx kotadb --stdio
```

In v2.2.0+, you can now filter:

```bash
# New way - filtered tools
bunx kotadb --stdio --toolset search,memory
```

### Updating Configurations

Update your `.mcp.json` configurations:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb", "--stdio", "--toolset", "search,analysis,memory"]
    }
  }
}
```

## Next Steps

- Choose appropriate toolsets for your workflows
- Set up project-specific toolset configurations
- Create custom toolsets for repetitive tasks
- Integrate toolset selection into your development process
- Review the Unified Search Guide for enhanced search capabilities