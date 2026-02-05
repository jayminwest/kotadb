/**
 * Context Contract Validation Library
 * 
 * Provides pre-spawn validation, scope enforcement, and post-complete validation
 * for agents with context contracts.
 */

import { glob } from 'glob';
import { existsSync } from 'fs';
import path from 'path';

export interface RequirementSpec {
  type: 'spec_file' | 'expertise' | 'memory' | 'prompt' | 'inbox' | 'file' | 'env';
  key: string;
  description?: string;
  path?: string;
  scope?: string;
  required?: boolean;
}

export interface FileScope {
  scope: string;
  exclude?: string[];
}

export interface TestScope {
  scope: string;
  colocated?: string;
  requiresTests?: boolean;
}

export interface MemoryScope {
  allowed: ('decision' | 'failure' | 'insight')[];
}

export interface OutputScope {
  files?: FileScope;
  tests?: TestScope;
  memory?: MemoryScope;
}

export interface ValidationCheck {
  check: string;
  target?: string;
  command?: string;
}

export interface ValidationConfig {
  preSpawn?: ValidationCheck[];
  postComplete?: ValidationCheck[];
}

export interface ContextContract {
  requires?: RequirementSpec[];
  produces?: OutputScope;
  contextSource: 'spec_file' | 'prompt' | 'inbox' | 'hybrid';
  validation?: ValidationConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  injectedContext?: Record<string, any>;
}

/**
 * Validate contract requirements before spawning agent
 */
export async function validateBeforeSpawn(
  agentName: string,
  contract: ContextContract,
  providedContext: Record<string, any>
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const injectedContext: Record<string, any> = {};

  if (!contract.requires) {
    return { valid: true, errors, warnings, injectedContext };
  }

  // Check required files exist
  for (const req of contract.requires) {
    if (req.required === false) {
      continue;
    }

    if (req.type === 'spec_file' || req.type === 'expertise' || req.type === 'file') {
      const filePath = req.path || providedContext[req.key];
      
      if (!filePath) {
        errors.push(\`Required \${req.type} not provided: \${req.key}\`);
        continue;
      }

      if (!existsSync(filePath)) {
        errors.push(\`Required file not found: \${filePath} (\${req.key})\`);
      }
    }

    if (req.type === 'memory') {
      // Pre-flight memory search
      // This would call MCP memory tools and inject results
      // For now, just note that memory is available
      injectedContext[req.key] = \`Memory search available for: \${req.scope || 'all'}\`;
    }

    if (req.type === 'prompt') {
      if (!providedContext[req.key]) {
        errors.push(\`Required prompt context not provided: \${req.key}\`);
      }
    }

    if (req.type === 'env') {
      if (!process.env[req.key]) {
        errors.push(\`Required environment variable not set: \${req.key}\`);
      }
    }
  }

  // Run custom pre-spawn validations
  if (contract.validation?.preSpawn) {
    for (const check of contract.validation.preSpawn) {
      if (check.check === 'file_exists' && check.target) {
        const targetPath = providedContext[check.target];
        if (!targetPath || !existsSync(targetPath)) {
          errors.push(\`Pre-spawn validation failed: file \${check.target} not found\`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    injectedContext
  };
}

/**
 * Check if file path matches contract scope
 */
export function validateScope(
  filePath: string,
  contract: ContextContract
): { allowed: boolean; reason?: string } {
  if (!contract.produces?.files) {
    return { allowed: true };
  }

  const { scope, exclude } = contract.produces.files;

  // Check against scope pattern
  const matchesScope = glob.sync(scope).some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(filePath);
  });

  if (!matchesScope) {
    return {
      allowed: false,
      reason: \`File \${filePath} is outside declared scope: \${scope}\`
    };
  }

  // Check against exclusions
  if (exclude) {
    for (const excludePattern of exclude) {
      const regex = new RegExp('^' + excludePattern.replace(/\*/g, '.*') + '$');
      if (regex.test(filePath)) {
        return {
          allowed: false,
          reason: \`File \${filePath} matches exclusion pattern: \${excludePattern}\`
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Validate outputs after agent completes
 */
export async function validateAfterComplete(
  agentName: string,
  contract: ContextContract,
  modifiedFiles: string[]
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate all modified files are in scope
  if (contract.produces?.files) {
    for (const file of modifiedFiles) {
      const result = validateScope(file, contract);
      if (!result.allowed) {
        errors.push(result.reason || \`File \${file} out of scope\`);
      }
    }
  }

  // Check that tests exist for new source files
  if (contract.produces?.tests?.requiresTests) {
    const sourceFiles = modifiedFiles.filter(f => 
      !f.includes('__tests__') && 
      !f.includes('.test.') && 
      !f.includes('.spec.')
    );

    const testFiles = modifiedFiles.filter(f => 
      f.includes('__tests__') || 
      f.includes('.test.') || 
      f.includes('.spec.')
    );

    if (sourceFiles.length > 0 && testFiles.length === 0) {
      warnings.push(\`Source files modified but no tests added: \${sourceFiles.join(', ')}\`);
    }
  }

  // Run custom post-complete validations
  if (contract.validation?.postComplete) {
    for (const check of contract.validation.postComplete) {
      if (check.check === 'tests_pass' && check.command) {
        // Note: actual execution would require exec() call
        warnings.push(\`Post-complete validation: \${check.command} (not executed in validation)\`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Parse context contract from agent frontmatter
 */
export function parseContractFromFrontmatter(frontmatter: string): ContextContract | null {
  try {
    const yaml = require('js-yaml');
    const parsed = yaml.load(frontmatter);
    return parsed.contextContract || null;
  } catch (error) {
    return null;
  }
}
