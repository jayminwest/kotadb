# Environment Profiles

Store JSON or YAML descriptors here when different deployment environments require unique validation commands, credentials, or flags. Each file should include:
- `name`: environment identifier (local, staging, production).
- `validation_overrides`: commands to add/remove for that environment.
- `credentials`: keys required by the orchestrator (referencing `.env` variables).

Example skeleton:
```yaml
name: staging
validation_overrides:
  add:
    - bun run test:api
  remove:
    - bun test
credentials:
  - SUPABASE_STAGING_URL
  - SUPABASE_STAGING_SERVICE_ROLE_KEY
```
