# Contributing to KotaDB

Thank you for your interest in contributing to KotaDB! This document provides guidelines for contributing to the open source core codebase.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for Supabase Local)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for migrations)
- Git 2.0+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/jayminwest/kotadb.git
cd kotadb

# Install dependencies
cd app && bun install

# Start local Supabase instance
cd app && bunx supabase start

# Copy environment template
cp .env.sample .env
# Edit .env with your local Supabase credentials (output from supabase start)

# Apply database migrations
cd app && bunx supabase db push

# Run tests to verify setup
cd app && bun run test:setup
cd app && bun test
cd app && bun run test:teardown
```

## Git Flow and Branch Strategy

KotaDB uses a git flow workflow with two main branches:

- **develop**: Default branch for active development (all PRs merge here)
- **main**: Production-ready releases (promoted from develop)

### Creating a Feature Branch

```bash
# Fetch latest changes
git fetch --all --prune

# Create feature branch from develop
git checkout develop
git pull --rebase
git checkout -b feat/your-feature-name

# Or for bug fixes
git checkout -b bug/your-bug-fix-name

# Or for chores (docs, config, etc.)
git checkout -b chore/your-chore-name
```

### Branch Naming Convention

- `feat/description` - New features
- `bug/description` - Bug fixes
- `chore/description` - Maintenance tasks (docs, config, dependencies)
- `test/description` - Test improvements
- `refactor/description` - Code refactoring

## Testing Philosophy: Antimocking

KotaDB follows an **antimocking philosophy** - tests use real service connections (Supabase Local, Stripe Test Mode) instead of mocks or stubs.

**Why antimocking?**

- Catches integration bugs that mocks would miss
- Ensures production parity (tests run against real PostgreSQL)
- Validates database migrations and RLS policies
- Tests actual network behavior, timeouts, and error handling

**Testing Guidelines:**

- DO use real Supabase Local database connections
- DO use real Stripe Test Mode for billing tests
- DO NOT create mock helpers (`createMockSupabase`, `createFakeStripe`, etc.)
- DO NOT use manual spies or stubs
- DO use Docker Compose for isolated test environments

See `.claude/commands/docs/anti-mock.md` for complete testing philosophy.

### Running Tests

```bash
# Start test infrastructure (Supabase Local + services)
cd app && bun run test:setup

# Run all tests
cd app && bun test

# Run specific test file
cd app && bun test src/api/routes.test.ts

# Run tests with filter
cd app && bun test --filter integration

# Reset test database if needed
cd app && bun run test:reset

# Stop test infrastructure when done
cd app && bun run test:teardown
```

## Code Style and Linting

KotaDB uses [Biome](https://biomejs.dev) for linting and formatting:

```bash
# Run linter
cd app && bun run lint

# Fix auto-fixable issues
cd app && bun run lint:fix

# Type-check
cd app && bunx tsc --noEmit
```

**Code Standards:**

- TypeScript strict mode enabled
- Path aliases required (`@api/*`, `@auth/*`, `@db/*`, etc. - see `app/tsconfig.json`)
- Use `process.stdout.write()` / `process.stderr.write()` (NEVER `console.*`)
- Use `sys.stdout.write()` / `sys.stderr.write()` in Python (NEVER `print()`)

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org) format:

```
<type>(<scope>): <subject>

<body>
```

**Valid types:**

- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance tasks
- `docs`: Documentation changes
- `test`: Test improvements
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes

**Examples:**

```
feat(mcp): add dependency graph traversal tool
fix(auth): prevent rate limit bypass via JWT rotation
chore(deps): upgrade Bun to v1.2.0
docs(readme): add self-hosting guide
test(api): add integration tests for GitHub webhook
```

**AVOID meta-commentary patterns:**

- ❌ "Based on the plan, this commit adds..."
- ❌ "Here is the implementation of..."
- ❌ "Looking at the issue, I can see..."
- ✅ "feat(api): add rate limiting middleware"

## Pull Request Guidelines

### Before Submitting

1. Create your feature branch from `develop`
2. Make your changes with clear, focused commits
3. Add tests for new functionality
4. Ensure all tests pass locally
5. Run linting and type-checking
6. Update documentation as needed

### PR Submission

```bash
# Push your branch
git push -u origin feat/your-feature-name

# Create PR via GitHub CLI
gh pr create --base develop --title "feat: your feature description" --body "Description of changes"
```

**PR Title Format:**

- Use Conventional Commit format
- Link to issue if applicable: `feat: add dependency analysis (#123)`

**PR Body Template:**

```markdown
## Summary

- Brief description of changes
- Why these changes are needed
- Any breaking changes or migrations

## Test Plan

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing performed
- [ ] Documentation updated

## Validation

- Validation level: [1/2/3]
- Lint: [pass/fail]
- Typecheck: [pass/fail]
- Tests: [X/Y passing]
```

### PR Review Process

1. All PRs require passing CI checks (lint, typecheck, tests)
2. Maintainer will review code and provide feedback
3. Address feedback with new commits (DO NOT force-push)
4. Once approved, maintainer will merge to `develop`

## Repository Sync

**IMPORTANT:** This repository is automatically synced from a private development repository. Changes are pushed to this public fork via GitHub Actions on merges to `develop` and `main`.

**What this means for contributors:**

- Your PR may be merged in the private repo first, then synced here
- Direct commits to this public fork will be overwritten by the sync
- All contributions should go through the PR process

## Code of Conduct

**Expected Behavior:**

- Be respectful and professional in all interactions
- Provide constructive feedback in code reviews
- Focus on the technical merits of contributions
- Respect maintainer decisions on scope and direction

**Unacceptable Behavior:**

- Harassment or discrimination of any kind
- Trolling, insulting comments, or personal attacks
- Publishing others' private information
- Other conduct deemed inappropriate in a professional setting

Violations may result in removal from the project.

## Questions?

- **Technical questions**: Open a GitHub Discussion
- **Bug reports**: Open a GitHub Issue with reproduction steps
- **Feature requests**: Open a GitHub Issue with use case and requirements
- **Security vulnerabilities**: Email jaymin@jayminwest.com (DO NOT open public issue)

## Consulting

For paid consulting, custom integrations, or commercial support, contact Jaymin West at jaymin@jayminwest.com.

## License

By contributing to KotaDB, you agree that your contributions will be licensed under the MIT License.
