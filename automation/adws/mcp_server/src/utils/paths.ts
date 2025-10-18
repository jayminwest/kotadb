/**
 * Path resolution utilities for MCP server
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get project root directory (kota-db-ts/)
 */
export function getProjectRoot(): string {
  // From automation/adws/mcp_server/src/utils/paths.ts, go up 5 levels to reach project root
  // automation/adws/mcp_server/src/utils → automation/adws/mcp_server/src → automation/adws/mcp_server → automation/adws → automation → [project root]
  return join(__dirname, '../../../../..');
}

/**
 * Get automation directory path
 */
export function getAutomationDir(): string {
  return join(getProjectRoot(), 'automation');
}

/**
 * Get app directory path
 */
export function getAppDir(): string {
  return join(getProjectRoot(), 'app');
}
