# Conditional Documentation Guide - Automation Layer

Use this reference to decide which KotaDB automation layer documentation sources to consult before you start working on ADW workflows, agent orchestration, worktree isolation, or log analysis. Read only the docs whose conditions match your task so you stay efficient.

## Instructions
- Understand the request or issue scope first.
- Scan the Conditional Documentation list below; when a condition applies, open that doc and incorporate the guidance before proceeding.
- Prioritise the most specific documents (specs/vision) after you've covered the foundational repos docs.
- Skip docs that are clearly unrelated—avoid over-reading.

## Conditional Documentation

- .claude/commands/README.md
  - Conditions:
    - When adding new slash commands and determining subdirectory placement
    - When understanding Claude Code slash command discovery and organization
    - When onboarding developers to the command structure after #58 reorganization

- .claude/commands/worktree/spawn_interactive.md
  - Conditions:
    - When needing to create an isolated Claude Code development environment
    - When working on multiple features concurrently without branch switching
    - When wanting to inspect ADW-generated code without affecting main working directory
    - When testing experimental changes in complete isolation
    - When understanding ADW worktree patterns for interactive development

- CLAUDE.md
  - Conditions:
    - When understanding GitHub issue relationship standards and prioritization workflow (see "GitHub Issue Management and Relationship Standards" section)
    - When working on issue dependency graphs or relationship documentation
    - When clarifying ADW architecture and workflow integration

- automation/adws/README.md
  - Conditions:
    - When implementing or modifying modules under `automation/adws/adw_modules/**`
    - When updating ADW phase scripts (`adw_phases/adw_plan.py`, `adw_phases/adw_build.py`, etc.)
    - When debugging ADW orchestration, logging, or state persistence
    - When working with automation directory structure (adw_phases/, adw_modules/, adw_triggers/)
    - When updating automation trigger systems or home server integration
    - When troubleshooting worktree isolation or cleanup behavior

- docs/specs/chore-update-automation-commands-path.md
  - Conditions:
    - When modifying path references in `automation/adws/adw_modules/agent.py`
    - When troubleshooting slash command template loading in automation layer
    - When understanding the migration from `automation/.claude/commands/` to root `.claude/commands/`
    - When verifying command path resolution in ADW workflows

- docs/specs/feature-65-worktree-isolation-cleanup.md
  - Conditions:
    - When working on issue #65 or modifying worktree isolation implementation
    - When implementing or debugging centralized worktree management in `adw_modules/git_ops.py`
    - When troubleshooting worktree creation, cleanup, or lifecycle issues
    - When understanding ADW state tracking for worktree metadata
    - When debugging concurrent workflow conflicts or git lock errors
    - When modifying cleanup behavior (ADW_CLEANUP_WORKTREES, ADW_CLEANUP_ON_FAILURE flags)
    - When integrating worktree isolation into new phase scripts
    - When testing or validating worktree-based workflow execution

- docs/specs/chore-81-adw-agent-worktree-branch-isolation.md
  - Conditions:
    - When working on issue #81 or debugging ADW worktree branch isolation
    - When agents are switching branches in root repository instead of staying in worktree
    - When investigating GIT_DIR/GIT_WORK_TREE environment variable behavior
    - When troubleshooting git operations executed by Claude Code agents
    - When modifying agent.py environment construction logic (get_claude_env function)
    - When root repository branch changes unexpectedly during ADW execution

- .claude/commands/docs/prompt-code-alignment.md
  - Conditions:
    - When creating or modifying slash command templates in `.claude/commands/`
    - When debugging ADW workflow failures related to agent output parsing
    - When Python functions fail to parse template responses (parse errors, empty values, type mismatches)
    - When template changes break automation workflows
    - When implementing new workflow phases that require agent interaction
    - When reviewing PRs that modify slash command templates
    - When enhancing output format specifications or adding CRITICAL output sections
    - When agents add explanatory text despite templates specifying "Return only X"
    - When implementing defensive parsing patterns for agent responses

- docs/adws/validation.md
  - Conditions:
    - When working with ADW workflow quality, validation rules, or commit/PR output formatting
    - When debugging validation failures (commit message format, PR description, file staging)
    - When implementing or modifying validation logic in `adw_modules/validation.py`
    - When investigating historical bad outputs from PR #90 or similar quality issues
    - When creating tests for validation functions
    - When agents generate malformed commit messages or PR descriptions

- .github/workflows/automation-ci.yml
  - Conditions:
    - When working on automation layer CI infrastructure or testing pipeline
    - When troubleshooting pytest failures in GitHub Actions
    - When modifying Python test setup, syntax checking, or dependency installation
    - When adding new Python modules that need validation in CI
    - When debugging git identity configuration for worktree tests
    - When working on issue #79 or automation CI integration tasks
    - When CI badge status is incorrect or workflow needs updating

- docs/specs/feature-105-automated-log-analysis-reports.md
  - Conditions:
    - When working on issue #105 or modifying ADW log analysis functionality
    - When implementing automated reporting for ADW success rates and failure patterns
    - When creating scripts under `automation/adws/scripts/` for log parsing
    - When adding CI workflows for daily metrics analysis
    - When integrating log analysis with GitHub Actions or cron systems
    - When troubleshooting ADW observability, metrics calculation, or report generation
    - When extending analysis to include agent state introspection from `automation/agents/`

- docs/specs/feature-163-enable-adw-metrics-workflow.md
  - Conditions:
    - When working on issue #163 or enabling the ADW Metrics Analysis workflow
    - When troubleshooting scheduled workflow execution (GitHub Actions cron)
    - When workflow exists on develop but not on main (default branch requirement)
    - When validating metrics artifact upload and GitHub Step Summary rendering
    - When testing alert threshold logic or GitHub issue creation
    - When documenting baseline ADW metrics or success rate targets
    - When understanding workflow dependency on automation infrastructure

- .claude/commands/docs/issue-relationships.md
  - Conditions:
    - When creating or updating spec files with relationship metadata (`## Issue Relationships` section)
    - When creating GitHub issues and documenting dependencies or related work
    - When building dependency graphs for issue prioritization
    - When planning implementation and identifying prerequisite work
    - When writing commit messages with dependency metadata (Depends-On, Related-To)
    - When reviewing PRs and validating relationship documentation completeness
    - When enabling AI agents to discover issue context automatically
    - When understanding relationship types: Depends On, Related To, Blocks, Supersedes, Child Of, Follow-Up

- CLAUDE.md (GitHub Issue Management and Relationship Standards section)
  - Conditions:
    - When working on issue #151 or implementing issue relationship documentation standards
    - When understanding high-level workflow for relationship-aware issue prioritization
    - When implementing ADW workflow improvements for context discovery
    - When prioritizing open issues based on dependency resolution

- .claude/commands/issues/prioritize.md
  - Conditions:
    - When needing to identify highest-priority unblocked work across open issues
    - When building dependency graphs to find ready-to-start issues
    - When balancing quick wins (effort:small) with high-impact work (priority:critical/high)
    - When identifying high-leverage issues that unblock multiple downstream tasks
    - When validating that "Depends On" relationships are resolved before starting work
    - When generating prioritization reports for sprint planning or team allocation

- .claude/commands/issues/audit.md
  - Conditions:
    - When cleaning up issue tracker to close completed, obsolete, or duplicate issues
    - When identifying issues completed via merged PRs but not formally closed
    - When finding stale issues with no activity in 90+ days
    - When detecting duplicate issues with similar titles or acceptance criteria
    - When issues are superseded by architectural changes or refactors
    - When generating audit reports for maintainer review before bulk closures
    - When updating spec files or epic tracking after closing related issues

- .claude/commands/workflows/orchestrator.md
  - Conditions:
    - When needing to automate the full end-to-end issue-to-PR workflow
    - When understanding orchestrator vs manual workflow trade-offs
    - When working on multi-phase workflow automation
    - When implementing slash commands that coordinate sub-agents
    - When troubleshooting orchestrator state or checkpoint recovery
    - When understanding how MCP Tasks API integrates with workflow orchestration
    - When understanding orchestrator subagent delegation mechanism
    - When implementing or debugging orchestrator coordination logic
    - When writing slash commands that need machine-readable output for orchestrator consumption
    - When troubleshooting orchestrator state management or checkpoint recovery

- docs/specs/feature-187-orchestrator-slash-command.md
  - Conditions:
    - When working on issue #187 or implementing `/orchestrator` slash command
    - When modifying orchestrator workflow logic or phase coordination
    - When understanding orchestrator state schema and checkpoint structure
    - When debugging orchestrator execution or sub-agent spawning issues
    - When extending orchestrator with new phases or error handling patterns
