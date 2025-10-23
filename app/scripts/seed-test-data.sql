-- Production and Staging Seed Data Script
-- Minimal test data for validating Supabase instances after reset
-- Created for chore #204: Reset production and staging Supabase instances
--
-- This script creates:
-- - 3 test users (one per tier: free, solo, team)
-- - 1 test organization for team tier
-- - 3 API keys (one per tier) with known credentials for testing
--
-- Security note: These are TEST credentials only. Do not use in production
-- environments with real data. The bcrypt hash is for the secret:
-- 0123456789abcdef0123456789abcdef0123456789abcdef0123

-- ============================================================================
-- Test Users
-- ============================================================================

-- Create test users for each tier
-- These users are for API validation only (no real authentication needed)
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, 'test-free@kotadb.local', now(), now()),
    ('00000000-0000-0000-0000-000000000002'::uuid, 'test-solo@kotadb.local', now(), now()),
    ('00000000-0000-0000-0000-000000000003'::uuid, 'test-team@kotadb.local', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Test Organizations
-- ============================================================================

-- Create test organization for team tier validation
INSERT INTO organizations (id, name, slug, owner_id, created_at, updated_at)
VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, 'KotaDB Test Org', 'kotadb-test-org', '00000000-0000-0000-0000-000000000003'::uuid, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Add team user to organization as owner
INSERT INTO user_organizations (user_id, org_id, role, joined_at)
VALUES
    ('00000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, 'owner', now())
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ============================================================================
-- Test API Keys
-- ============================================================================

-- API key format: kota_<tier>_<key_id>_<secret>
-- Shared secret for all test keys: 0123456789abcdef0123456789abcdef0123456789abcdef0123
-- Bcrypt hash (10 rounds): $2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve
--
-- NOTE: This hash matches the secret above for testing purposes.
-- In production environments, regenerate keys using `bun run scripts/generate-automation-key.ts`.

-- Free tier test key: kota_free_testfree123456_0123456789abcdef0123456789abcdef0123456789abcdef0123
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000001'::uuid,
        'testfree123456',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'free',
        100,
        true,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- Solo tier test key: kota_solo_testsolo123456_0123456789abcdef0123456789abcdef0123456789abcdef0123
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000002'::uuid,
        'testsolo123456',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'solo',
        1000,
        true,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- Team tier test key: kota_team_testteam123456_0123456789abcdef0123456789abcdef0123456789abcdef0123
INSERT INTO api_keys (user_id, key_id, secret_hash, tier, rate_limit_per_hour, enabled, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000003'::uuid,
        'testteam123456',
        '$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve',
        'team',
        10000,
        true,
        now()
    )
ON CONFLICT (key_id) DO NOTHING;

-- ============================================================================
-- Verification Queries (run after seeding)
-- ============================================================================

-- Verify users created
-- Expected: 3 rows
-- SELECT id, email FROM auth.users WHERE email LIKE '%@kotadb.local' ORDER BY id;

-- Verify API keys created
-- Expected: 3 rows with tiers free, solo, team
-- SELECT key_id, tier, rate_limit_per_hour, enabled FROM api_keys WHERE key_id LIKE 'test%' ORDER BY tier;

-- Verify organization and membership
-- Expected: 1 organization with 1 owner
-- SELECT o.slug, o.name, uo.role
-- FROM organizations o
-- JOIN user_organizations uo ON o.id = uo.org_id
-- WHERE o.slug = 'kotadb-test-org';

-- ============================================================================
-- Test API Keys Reference (for manual testing)
-- ============================================================================

-- Free Tier:  kota_free_testfree123456_0123456789abcdef0123456789abcdef0123456789abcdef0123
-- Solo Tier:  kota_solo_testsolo123456_0123456789abcdef0123456789abcdef0123456789abcdef0123
-- Team Tier:  kota_team_testteam123456_0123456789abcdef0123456789abcdef0123456789abcdef0123
--
-- Usage example:
-- curl -X POST https://<supabase-url>/rest/v1/index \
--   -H "Authorization: Bearer kota_free_testfree123456_0123456789abcdef0123456789abcdef0123456789abcdef0123" \
--   -H "Content-Type: application/json" \
--   -d '{"repo_path": "test/repo", "ref": "main"}'
