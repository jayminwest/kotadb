---
description: Load documentation from their respective websites into local markdown files our agents can use as context.
allowed-tools: Task, WebFetch, Write, Edit, Bash(ls*), Bash(mkdir*), mcp__firecrawl-mcp__firecrawl_scrape
argument-hint: [category] (claude-code|anthropic|uv|zod|supabase|stripe|openai|google|nextjs|all)
---

# Load AI Docs

**Template Category**: Action
**Prompt Level**: 2 (Parameterized)

Load documentation from their respective websites into local markdown files our agents can use as context.

## Variables

DELETE_OLD_AI_DOCS_AFTER_HOURS: 24
DEFAULT_CATEGORY: all

## Usage

- `/docs:load-ai-docs` - Load all documentation
- `/docs:load-ai-docs claude-code` - Load only Claude Code docs
- `/docs:load-ai-docs anthropic` - Load only Anthropic docs
- `/docs:load-ai-docs uv` - Load only UV (development tools) docs
- `/docs:load-ai-docs zod` - Load only Zod validation docs
- `/docs:load-ai-docs supabase` - Load only Supabase docs
- `/docs:load-ai-docs stripe` - Load only Stripe docs
- `/docs:load-ai-docs openai` - Load only OpenAI docs
- `/docs:load-ai-docs google` - Load only Google AI docs
- `/docs:load-ai-docs nextjs` - Load only Next.js docs

## Category URL Mappings

### Claude Code
| URL | Output Path |
|-----|-------------|
| https://code.claude.com/docs/en/mcp.md | claude-code/mcp.md |
| https://code.claude.com/docs/en/slash-commands.md | claude-code/slash-commands.md |
| https://code.claude.com/docs/en/sub-agents.md | claude-code/sub-agents.md |
| https://code.claude.com/docs/en/sdk/sdk-python.md | claude-code/sdk-python.md |
| https://code.claude.com/docs/en/sdk/sdk-typescript.md | claude-code/sdk-typescript.md |
| https://code.claude.com/docs/en/hooks.md | claude-code/hooks.md |

### Anthropic
| URL | Output Path |
|-----|-------------|
| https://docs.anthropic.com/en/docs/about-claude/models/overview | anthropic/models-overview.md |

### Development Tools (UV)
| URL | Output Path |
|-----|-------------|
| https://docs.astral.sh/uv/guides/scripts/ | development-tools/uv/scripts-guide.md |
| https://docs.astral.sh/uv/guides/projects/#managing-dependencies | development-tools/uv/projects-dependencies.md |

### Validation (Zod)
| URL | Output Path |
|-----|-------------|
| https://zod.dev/?id=introduction | validation/zod/getting-started.md |
| https://zod.dev/?id=primitives | validation/zod/primitives.md |
| https://zod.dev/?id=objects | validation/zod/objects.md |
| https://zod.dev/?id=arrays | validation/zod/arrays.md |
| https://zod.dev/?id=unions | validation/zod/unions.md |
| https://zod.dev/?id=error-handling | validation/zod/error-handling.md |

### Database (Supabase)
| URL | Output Path |
|-----|-------------|
| https://supabase.com/docs/reference/javascript/introduction | database/supabase/javascript-client.md |
| https://supabase.com/docs/guides/auth | database/supabase/auth.md |
| https://supabase.com/docs/guides/database | database/supabase/database.md |
| https://supabase.com/docs/guides/realtime | database/supabase/realtime.md |
| https://supabase.com/docs/guides/functions | database/supabase/edge-functions.md |

### Payments (Stripe)
| URL | Output Path |
|-----|-------------|
| https://stripe.com/docs/api | payments/stripe/api-overview.md |
| https://stripe.com/docs/api/subscriptions | payments/stripe/subscriptions.md |
| https://stripe.com/docs/webhooks | payments/stripe/webhooks.md |
| https://stripe.com/docs/payments/checkout | payments/stripe/checkout.md |
| https://stripe.com/docs/customer-management/customer-portal | payments/stripe/customer-portal.md |

### Frameworks (Next.js)
| URL | Output Path |
|-----|-------------|
| https://nextjs.org/docs/app | frameworks/nextjs/app-router.md |
| https://nextjs.org/docs/app/building-your-application/routing/route-handlers | frameworks/nextjs/api-routes.md |
| https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations | frameworks/nextjs/server-actions.md |

## Workflow

1. Parse `$ARGUMENTS` to determine category filter (default: all)
   - Valid categories: `claude-code`, `anthropic`, `uv`, `zod`, `supabase`, `stripe`, `openai`, `google`, `nextjs`, `all`
   - If invalid category, report error and list valid categories

2. Filter URLs by category from the mappings above

3. For each URL/output-path pair:
   - Check if `docs/ai_docs/<output-path>` exists
   - If exists and created within `DELETE_OLD_AI_DOCS_AFTER_HOURS` hours, skip (note as skipped)
   - Otherwise, delete old file if it exists (note as deleted)

4. Ensure category directories exist (use mkdir -p)

5. For each filtered URL that was not skipped, use the Task tool in parallel with `docs-scraper` agent:
   <scrape_loop_prompt>
   Use @agent-docs-scraper agent - pass it the url and target output path in format: "<url> -> <output-path>"
   Example: "https://code.claude.com/docs/en/hooks.md -> claude-code/hooks.md"
   </scrape_loop_prompt>

6. After all Tasks are complete, respond in the Report Format

## Report Format

```
AI Docs Report:
Category: <category-name or "all">

Results:
- <✅ or ❌>: <url> -> <output-path>
...

Summary: X/Y docs loaded, Z skipped (fresh), W failed
```
