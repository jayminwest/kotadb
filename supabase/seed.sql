-- Test Data Seeding Script
-- Populates test database with deterministic data for testing

-- ============================================================================
-- Test Users
-- ============================================================================

-- Test user for free tier
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, 'test-free@example.com', now(), now()),
    ('00000000-0000-0000-0000-000000000002'::uuid, 'test-solo@example.com', now(), now()),
    ('00000000-0000-0000-0000-000000000003'::uuid, 'test-team@example.com', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test Organizations
-- ============================================================================

INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, 'Test Organization', 'test-org', '00000000-0000-0000-0000-000000000003'::uuid, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Add team user to organization
INSERT INTO user_organizations (user_id, org_id, role, joined_at)
VALUES
    ('00000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'owner', now())
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ============================================================================
-- Test API Keys
-- ============================================================================

-- Test API keys with bcrypt-hashed secrets
-- Format: kota_<tier>_<key_id>_<secret>
-- Secret for all test keys: 0123456789abcdef0123456789abcdef
-- Bcrypt hash: $2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve

-- Free tier test key: kota_free_test1234567890ab_0123456789abcdef0123456789abcdef
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000001'::uuid,
        'test1234567890ab',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'free',
        100,
        true,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- Solo tier test key: kota_solo_solo1234567890ab_0123456789abcdef0123456789abcdef
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000002'::uuid,
        'solo1234567890ab',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'solo',
        1000,
        true,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- Team tier test key: kota_team_team1234567890ab_0123456789abcdef0123456789abcdef
-- Note: For now using user_id until schema is migrated to support org-level keys
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000003'::uuid,
        'team1234567890ab',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'team',
        10000,
        true,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- Disabled test key for testing disabled key handling
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000001'::uuid,
        'disabled12345678',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'free',
        100,
        false,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- ============================================================================
-- Test Repositories
-- ============================================================================

INSERT INTO repositories (id, user_id, full_name, git_url, default_branch, created_at, updated_at)
VALUES
    (
        '20000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000001'::uuid,
        'testuser/test-repo',
        'https://github.com/testuser/test-repo.git',
        'main',
        now(),
        now()
    ),
    (
        '20000000-0000-0000-0000-000000000002'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid,
        'solouser/solo-repo',
        'https://github.com/solouser/solo-repo.git',
        'main',
        now(),
        now()
    )
ON CONFLICT (id) DO NOTHING;

-- Team repository
INSERT INTO repositories (id, org_id, full_name, git_url, default_branch, created_at, updated_at)
VALUES
    (
        '20000000-0000-0000-0000-000000000003'::uuid,
        '10000000-0000-0000-0000-000000000001'::uuid,
        'test-org/team-repo',
        'https://github.com/test-org/team-repo.git',
        'main',
        now(),
        now()
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test Indexed Files
-- ============================================================================

INSERT INTO indexed_files (repository_id, path, content, language, size_bytes, indexed_at)
VALUES
    (
        '20000000-0000-0000-0000-000000000001'::uuid,
        'src/index.ts',
        'export function hello() { return "Hello, World!"; }',
        'typescript',
        50,
        now()
    ),
    (
        '20000000-0000-0000-0000-000000000001'::uuid,
        'README.md',
        '# Test Repository\n\nThis is a test repository for KotaDB testing.',
        'markdown',
        65,
        now()
    )
ON CONFLICT (repository_id, path) DO NOTHING;

-- ============================================================================
-- Test Index Jobs
-- ============================================================================

INSERT INTO index_jobs (repository_id, ref, status, started_at, completed_at, created_at)
VALUES
    (
        '20000000-0000-0000-0000-000000000001'::uuid,
        'main',
        'completed',
        now() - interval '1 hour',
        now() - interval '30 minutes',
        now() - interval '1 hour'
    )
ON CONFLICT DO NOTHING;
