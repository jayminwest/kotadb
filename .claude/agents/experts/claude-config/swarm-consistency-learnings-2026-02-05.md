# Swarm Consistency Implementation - Learnings for Memory Recording

## Architectural Decisions

### 1. Context Contracts Use Declarative Frontmatter
**Context:** Issues #175 + #178 - needed machine-readable agent specifications for orchestration
**Decision:** Implemented contextContract YAML frontmatter with requires/produces/contextSource/validation
**Rationale:** Declarative contracts enable pre-spawn validation, runtime scope enforcement via hooks, and post-complete output verification. Moves coordination from prose to machine-parseable specifications.
**Scope:** architecture
**Related Files:** .claude/schemas/context-contract.schema.json, .claude/docs/context-contracts.md

### 2. Build Agents Use spec_file Context Source, Question Agents Use prompt
**Context:** Different agent types need different input mechanisms
**Decision:** Build agents declare contextSource: spec_file with SPEC variable requirement. Question agents declare contextSource: prompt with USER_PROMPT requirement.
**Rationale:** Build agents implement from structured specifications. Question agents respond to direct user questions. Explicit declaration enables orchestrators to validate context before spawning.
**Scope:** pattern
**Related Files:** All 20 expert domain agents (10 build + 10 question)

### 3. Agent Validation at Multiple Layers
**Context:** Need to catch configuration errors early and enforce constraints at runtime
**Decision:** Implemented validation at 4 layers: (1) Pre-commit JSON Schema validation, (2) Pre-spawn requirement checks, (3) Runtime scope enforcement via PreToolUse hook, (4) Post-complete output validation
**Rationale:** Each layer catches different error classes. Schema catches structural errors, pre-spawn catches missing requirements, runtime prevents out-of-scope modifications, post-complete validates outputs.
**Scope:** architecture
**Related Files:** .claude/hooks/kotadb/validate-agents.py, .claude/hooks/scope-enforcement.ts, .claude/lib/contract-validator.ts

### 4. Registry Auto-Generation Eliminates Manual Sync
**Context:** agent-registry.json frequently drifted out of sync with agent .md files
**Decision:** Created generate-registry.py to auto-generate registry from agent frontmatter as pre-commit hook
**Rationale:** Registry is derived artifact from agent files, not authoritative source. Auto-generation prevents divergence and eliminates manual maintenance burden.
**Scope:** architecture
**Related Files:** .claude/scripts/generate-registry.py, .claude/hooks/kotadb/validate-agents.py

## Patterns Established

### 1. Template Inheritance for Agent Files
**Pattern:** base-agent.md provides common sections, role templates (plan/build/improve/question) add role-specific content
**Why:** Reduces duplication, ensures consistency, enables template evolution
**Evidence:** .claude/templates/ (if exists - templates not yet committed)

### 2. Contract-First Agent Design
**Pattern:** Agents declare requirements and outputs upfront in frontmatter before workflow instructions
**Why:** Enables orchestrators to validate before spawning, supports graduated validation, makes dependencies explicit
**Evidence:** All 20 expert domain agents now have contextContract fields

### 3. Graduated Validation (preSpawn for requirements, postComplete for outputs)
**Pattern:** Validation split into pre-spawn (check inputs ready) and post-complete (check outputs valid)
**Why:** Fail fast on missing requirements, warn on output issues without blocking completion
**Evidence:** context-contract.schema.json validation field structure

### 4. Dual Language Approach (Python for Hooks, TypeScript for Runtime)
**Pattern:** Python for git hooks and CLI tools, TypeScript for runtime contract validation
**Why:** Python integrates naturally with git, TypeScript provides type safety for runtime validation
**Evidence:** .claude/scripts/*.py, .claude/lib/*.ts, .claude/hooks/scope-enforcement.ts

## Implementation Insights

### 1. Registry as Derived Artifact Insight
**Insight:** Auto-generating registry from agent files eliminates entire class of sync errors
**Context:** Manual registry updates were error-prone and frequently forgotten
**Impact:** Zero registry divergence issues going forward, reduced cognitive load
**Type:** discovery

### 2. Scope Enforcement at PreToolUse Prevents Cross-Domain Modifications
**Insight:** Runtime scope validation catches out-of-scope writes before they happen
**Context:** Without enforcement, agents could accidentally modify unrelated files
**Impact:** Hard boundary enforcement via scope-enforcement.ts hook
**Type:** discovery

### 3. JSON Schema Validation Catches Frontmatter Errors Pre-Commit
**Insight:** Structural validation before commit prevents silent agent failures
**Context:** Malformed frontmatter (colons in descriptions, wrong tool names) caused silent failures
**Impact:** Immediate feedback at commit time via validate-agents.py hook
**Type:** discovery

## Infrastructure Metrics

**New Files Created:** ~17
- 3 JSON Schemas (agent-frontmatter, context-contract, coordination-messages)
- 3 Python Scripts (generate-registry, validate-frontmatter, check-expertise-size)
- 2 TypeScript Files (contract-validator.ts, scope-enforcement.ts)
- 2 Python Hooks (validate-agents.py, validate-agent-edit.py)
- 2 Documentation Files (context-contracts.md, coordination-messages.md)

**Total Lines Added:** ~2,770 lines
- JSON Schemas: ~330 lines
- Python Scripts: ~600 lines
- TypeScript: ~410 lines
- Python Hooks: ~260 lines
- Documentation: ~600 lines

**Agents Modified:** 20 (10 build + 10 question)
- Added contextContract to all expert domain agents
- Build agents: Full contracts with file scope, test requirements, memory permissions
- Question agents: Minimal contracts with prompt + expertise requirements

**Domain Expertise Pruned:** 3 files
- claude-config: 951 -> 430 lines (55% reduction)
- automation: ~1281 -> ~reduced
- documentation: ~766 -> ~reduced

## Validation Coverage

**Pre-Commit:** JSON Schema validation of all agent frontmatter
**Pre-Spawn:** File existence checks for required inputs (SPEC, expertise.yaml)
**Runtime:** Scope enforcement for Write/Edit operations
**Post-Complete:** Test requirement validation, scope compliance checks

## Cross-Reference Updates Needed

- [ ] Update CLAUDE.md with context contract documentation
- [ ] Update /do command to use contract validation before spawning
- [ ] Create agent templates with contract examples
- [ ] Add contract visualization tooling
- [ ] Implement memory injection based on contract requirements
