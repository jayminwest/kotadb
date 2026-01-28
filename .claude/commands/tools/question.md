---
allowed-tools: Bash(git ls-files:*), Read
description: Answer questions about the project structure and documentation without coding
---

# Question

Answer the user's question by analyzing the project structure and documentation. This prompt is designed to provide information and answer questions without making any code changes.

## Instructions

- **IMPORTANT: This is a question-answering task only - DO NOT write, edit, or create any files**
- **IMPORTANT: Focus on understanding and explaining existing code and project structure**
- **IMPORTANT: Provide clear, informative answers based on project analysis**
- **IMPORTANT: If the question requires code changes, explain what would need to be done conceptually without implementing**

## Workflow

### 1. Understand the Question

Parse $ARGUMENTS to understand what the user is asking about:
- Project structure questions
- Documentation questions
- Code location questions
- Pattern/convention questions
- General codebase questions

### 2. Gather Project Context

Execute to understand the project structure:

```bash
git ls-files
```

This provides:
- All tracked files in the repository
- Folder organization
- File naming patterns
- Technology indicators (file extensions)

### 3. Read Key Documentation

Read relevant documentation based on the question:

- `README.md` - Project overview and getting started
- `CLAUDE.md` - Development guidance and command reference
- `docs/` directory files - Detailed documentation
- Package files (`package.json`, `turbo.json`) - Dependencies and scripts
- Configuration files as needed

### 4. Analyze and Connect

Connect the question to relevant parts of the project:
- Identify relevant files and directories
- Understand relationships between components
- Note patterns and conventions used
- Reference documentation where applicable

### 5. Provide Answer

Structure your response clearly:
- Direct answer to the question
- Supporting evidence from project files
- References to relevant documentation
- Conceptual explanations where applicable

## Response Guidelines

### For Structure Questions

```
The project is organized as follows:
- `apps/` - Application packages (app, web)
- `packages/` - Shared libraries (ui, config)
- `docs/` - Documentation
- `data/` - SQLite database files
...
```

### For "Where is X?" Questions

```
The [feature] is located in:
- `apps/app/lib/[feature]/` - Core logic
- `apps/app/app/[feature]/` - UI routes
- Reference: See docs/[relevant-doc].md for details
```

### For "How does X work?" Questions

```
[Feature] works by:
1. [Step 1 explanation]
2. [Step 2 explanation]
...

Key files:
- `path/to/file.ts` - [purpose]
- `path/to/other.ts` - [purpose]
```

### For Implementation Questions (Conceptual Only)

```
To implement [feature], you would conceptually:
1. [Step 1 - what would need to be done]
2. [Step 2 - what would need to be done]
...

Note: This command is read-only. To implement this, use /issues:feature or /workflows:implement.
```

## CRITICAL: Output Format Requirements

**Template Category**: Action (informational variant)

Provide clear, informative answers based on project analysis.

**DO NOT:**
- Write, edit, or create any files
- Suggest using Write, Edit, or unrestricted Bash tools
- Provide executable code snippets intended for implementation
- Use markdown headers beyond ## level in responses

**DO:**
- Reference specific file paths found in the project
- Quote relevant documentation
- Explain patterns and conventions discovered
- Suggest relevant commands for follow-up actions (e.g., "Use /issues:feature to plan this")

## Question

$ARGUMENTS
