#!/usr/bin/env ts-node
/**
 * PreToolUse Hook: Scope Enforcement
 * 
 * Validates Write/Edit operations against agent context contracts.
 * Blocks out-of-scope file modifications.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface HookInput {
  tool: string;
  parameters?: {
    file_path?: string;
    path?: string;
  };
  agent?: {
    name?: string;
    file?: string;
  };
}

interface ContextContract {
  produces?: {
    files?: {
      scope: string;
      exclude?: string[];
    };
  };
}

interface AgentFrontmatter {
  contextContract?: ContextContract;
}

function parseAgentContract(agentFile: string): ContextContract | null {
  try {
    if (!existsSync(agentFile)) {
      return null;
    }

    const content = readFileSync(agentFile, 'utf-8');
    const frontmatterMatch = content.match(/^---\s*\n(.*?)\n---\s*\n/s);
    
    if (!frontmatterMatch) {
      return null;
    }

    // Parse YAML frontmatter (simple parsing for contextContract)
    const yaml = require('js-yaml');
    const frontmatter: AgentFrontmatter = yaml.load(frontmatterMatch[1]);
    
    return frontmatter.contextContract || null;
  } catch (error) {
    return null;
  }
}

function matchesGlob(filePath: string, pattern: string): boolean {
  // Simple glob matching - ** matches any path segment, * matches within segment
  const regexPattern = pattern
    .replace(/\*\*/g, '§§§')  // Temp placeholder
    .replace(/\*/g, '[^/]*')   // * matches within segment
    .replace(/§§§/g, '.*')     // ** matches across segments
    .replace(/\./g, '\\.');    // Escape dots
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

function validateScope(filePath: string, contract: ContextContract): { allowed: boolean; reason?: string } {
  if (!contract.produces?.files) {
    return { allowed: true };
  }

  const { scope, exclude } = contract.produces.files;

  // Check if file matches scope
  if (!matchesGlob(filePath, scope)) {
    return {
      allowed: false,
      reason: `File ${filePath} is outside declared scope: ${scope}`
    };
  }

  // Check exclusions
  if (exclude) {
    for (const excludePattern of exclude) {
      if (matchesGlob(filePath, excludePattern)) {
        return {
          allowed: false,
          reason: `File ${filePath} matches exclusion pattern: ${excludePattern}`
        };
      }
    }
  }

  return { allowed: true };
}

function main(): void {
  try {
    // Read hook input from stdin
    const input = readFileSync(0, 'utf-8');
    const hookInput: HookInput = JSON.parse(input);

    // Only check Write and Edit tools
    if (hookInput.tool !== 'Write' && hookInput.tool !== 'Edit') {
      console.log(JSON.stringify({ result: 'continue' }));
      return;
    }

    // Get file path from tool parameters
    const filePath = hookInput.parameters?.file_path || hookInput.parameters?.path;
    if (!filePath) {
      console.log(JSON.stringify({ result: 'continue' }));
      return;
    }

    // Get agent information
    const agentFile = hookInput.agent?.file;
    if (!agentFile) {
      // No agent context, allow operation
      console.log(JSON.stringify({ result: 'continue' }));
      return;
    }

    // Parse agent contract
    const projectRoot = process.cwd();
    const agentPath = resolve(projectRoot, '.claude', 'agents', agentFile);
    const contract = parseAgentContract(agentPath);

    if (!contract || !contract.produces?.files) {
      // No contract or no file scope, allow operation
      console.log(JSON.stringify({ result: 'continue' }));
      return;
    }

    // Validate scope
    const validation = validateScope(filePath, contract);
    
    if (!validation.allowed) {
      console.log(JSON.stringify({
        result: 'fail',
        message: `Scope enforcement: ${validation.reason}`
      }));
      return;
    }

    console.log(JSON.stringify({ result: 'continue' }));
    
  } catch (error) {
    // On error, allow operation but log warning
    console.error(`Scope enforcement error: ${error}`);
    console.log(JSON.stringify({ result: 'continue' }));
  }
}

main();
