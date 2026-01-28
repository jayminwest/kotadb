/**
 * Test Environment Setup
 *
 * This script runs before all tests via Bun's --preload flag.
 * Provides minimal setup for SQLite-only local testing.
 *
 * Usage: bun test --preload ./tests/setup.ts
 *
 * NOTE: Supabase env loading removed for local-only v2.0.0 (Issue #591, #607)
 */

// No global setup needed for SQLite in-memory tests
// Each test creates its own isolated database instance

// Optional: Set default test timeout
// Bun.jest.setTimeout(30000);

// Optional: Global test hooks can be added here if needed
// import { beforeAll, afterAll } from "bun:test";
// beforeAll(async () => { ... });
// afterAll(async () => { ... });
