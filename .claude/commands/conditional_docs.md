# Conditional Documentation Guide

Use this reference to decide which KotaDB documentation sources to consult before you start working. Read only the docs whose conditions match your task so you stay efficient.

## Instructions
- Understand the request or issue scope first.
- Scan the Conditional Documentation list below; when a condition applies, open that doc and incorporate the guidance before proceeding.
- Prioritise the most specific documents (specs/vision) after you’ve covered the foundational repos docs.
- Skip docs that are clearly unrelated—avoid over-reading.

## Conditional Documentation

- README.md
  - Conditions:
    - When you are new to the repository or need an overview of tooling and workflows
    - When you must run or debug the Bun API service locally
    - When verifying required environment variables or docker commands

- CLAUDE.md
  - Conditions:
    - When editing files under `src/**` (API, indexer, database layers) and you need architecture context
    - When working with TypeScript path aliases or Bun-specific project structure
    - When clarifying validation commands or development workflows

- docs/supabase-setup.md
  - Conditions:
    - When integrating or troubleshooting Supabase services, keys, or environment variables
    - When running or authoring migrations that interact with Supabase
    - When preparing staging/production infrastructure that depends on Supabase

- docs/schema.md
  - Conditions:
    - When modifying database schema, migrations, or RLS policies
    - When debugging data flows between API routes and the database
    - When designing new tables, relationships, or rate-limiting behaviour

- docs/adw-parity-spec.md
  - Conditions:
    - When extending or refactoring automation inside `adws/**`
    - When aligning KotaDB’s ADW workflows with TAC parity
    - When planning roadmap items related to AI developer workflow tooling

- adws/README.md
  - Conditions:
    - When implementing or modifying modules under `adws/adw_modules/**`
    - When updating ADW phase scripts (`adw_plan.py`, `adw_build.py`, etc.)
    - When debugging ADW orchestration, logging, or state persistence

- docs/specs/authentication-middleware.md
  - Conditions:
    - When tasks involve authentication, request validation, or middleware behaviour
    - When adding or updating auth-specific Bun handlers or API routes

- docs/specs/database-foundation-supabase-migration.md
  - Conditions:
    - When performing foundational database work or Supabase migration parity
    - When syncing schema decisions with broader platform requirements

- docs/specs/mcp-compliant-endpoint.md
  - Conditions:
    - When building or updating MCP-compatible endpoints or integrations
    - When aligning API responses or protocols with MCP expectations

- docs/vision/*.md
  - Conditions:
    - When working on roadmap initiatives tied to long-term product epics
    - When you need to confirm scope against strategic goals or sequencing
    - When preparing discovery or planning work that spans multiple domains
