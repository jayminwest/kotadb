/**
 * Prompt loading utilities for ADW orchestrator
 *
 * Loads agent prompt files and expertise YAML for dynamic prompt construction.
 * Used by the orchestrator to build phase-specific prompts with proper
 * frontmatter stripping, conventions extraction, and variable injection.
 */
import { join } from "node:path";

/**
 * Load an agent prompt file, strip YAML frontmatter, and return the markdown body.
 *
 * Reads `.claude/agents/experts/{domain}/{domain}-{phase}-agent.md`, removes
 * the YAML frontmatter block (delimited by `---`), and returns the trimmed
 * markdown content.
 *
 * @param domain - Expert domain name (e.g., "automation", "database")
 * @param phase - Workflow phase (e.g., "plan", "build", "improve")
 * @param basePath - Project root directory. Defaults to process.cwd()
 * @returns The markdown body of the agent prompt with frontmatter stripped
 * @throws Error if the agent prompt file is not found
 */
export async function loadAgentPrompt(
  domain: string,
  phase: string,
  basePath?: string
): Promise<string> {
  const root = basePath ?? process.cwd();
  const filename = `${domain}-${phase}-agent.md`;
  const filePath = join(root, ".claude", "agents", "experts", domain, filename);

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(
      `Agent prompt not found: ${filePath} (domain="${domain}", phase="${phase}")`
    );
  }

  const raw = await file.text();
  return stripFrontmatter(raw);
}

/**
 * Strip YAML frontmatter from a markdown string.
 *
 * Frontmatter is defined as content between the first `---` (at the start of
 * the file) and the next `---` line. If no frontmatter is detected, the
 * original content is returned as-is.
 */
function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return content.trim();
  }

  // Find the closing `---` after the opening one
  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    // No closing delimiter found; return content as-is
    return content.trim();
  }

  // Skip past the closing `---` and its newline
  const afterFrontmatter = trimmed.slice(endIndex + 4);
  return afterFrontmatter.trim();
}

/**
 * Load expertise YAML for a domain and extract a compact conventions summary.
 *
 * Reads `.claude/agents/experts/{domain}/expertise.yaml` and produces a
 * ~500-1000 token markdown summary covering path aliases, logging rules,
 * key utility signatures, and naming conventions.
 *
 * @param domain - Expert domain name (e.g., "automation", "database")
 * @param basePath - Project root directory. Defaults to process.cwd()
 * @returns Formatted markdown string under a "## Codebase Conventions" header
 * @throws Error if the expertise file is not found
 */
export async function loadExpertiseConventions(
  domain: string,
  basePath?: string
): Promise<string> {
  const root = basePath ?? process.cwd();
  const filePath = join(root, ".claude", "agents", "experts", domain, "expertise.yaml");

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(
      `Expertise file not found: ${filePath} (domain="${domain}")`
    );
  }

  const raw = await file.text();
  return extractConventionsSummary(raw, domain);
}

/**
 * Extract a compact conventions summary from raw expertise YAML.
 *
 * Parses the YAML text line-by-line to extract key sections:
 * - Scope / primary codebase files
 * - Best practices
 * - Key operations (names only)
 * - Known patterns
 *
 * This avoids pulling in a full YAML parser dependency.
 */
function extractConventionsSummary(yamlContent: string, domain: string): string {
  const lines = yamlContent.split("\n");
  const sections: {
    scope: string[];
    bestPractices: string[];
    keyOps: string[];
    patterns: string[];
  } = {
    scope: [],
    bestPractices: [],
    keyOps: [],
    patterns: []
  };

  let currentTopLevel = "";
  let currentSecondLevel = "";

  for (const line of lines) {
    // Track top-level keys (no indentation)
    if (/^[a-z_]+:/.test(line)) {
      currentTopLevel = line.split(":")[0]!.trim();
      currentSecondLevel = "";
      continue;
    }

    // Track second-level keys (2-space indent)
    if (/^  [a-z_]+:/.test(line)) {
      currentSecondLevel = line.trim().split(":")[0]!.trim();

      // Capture key operation names
      if (currentTopLevel === "key_operations") {
        sections.keyOps.push(currentSecondLevel);
      }
      // Capture pattern names
      if (currentTopLevel === "patterns") {
        sections.patterns.push(currentSecondLevel.replace(/_/g, " "));
      }
      continue;
    }

    // Capture scope file paths
    if (currentTopLevel === "overview" && currentSecondLevel === "primary_codebase") {
      const match = line.match(/^\s+-\s+(.+)$/);
      if (match?.[1]) {
        sections.scope.push(match[1].trim());
      }
    }

    // Capture best practice bullet points (top-level items under best_practices subsections)
    if (currentTopLevel === "best_practices") {
      const match = line.match(/^\s{4}-\s+(.+)$/);
      if (match?.[1]) {
        sections.bestPractices.push(match[1].trim());
      }
    }
  }

  // Build compact markdown summary
  const parts: string[] = [];
  parts.push(`## Codebase Conventions (${domain})`);
  parts.push("");

  if (sections.scope.length > 0) {
    parts.push("### Key Files");
    for (const f of sections.scope.slice(0, 10)) {
      parts.push(`- \`${f}\``);
    }
    parts.push("");
  }

  if (sections.bestPractices.length > 0) {
    parts.push("### Best Practices");
    for (const bp of sections.bestPractices.slice(0, 15)) {
      parts.push(`- ${bp}`);
    }
    parts.push("");
  }

  if (sections.keyOps.length > 0) {
    parts.push("### Key Operations");
    for (const op of sections.keyOps) {
      parts.push(`- \`${op}\``);
    }
    parts.push("");
  }

  if (sections.patterns.length > 0) {
    parts.push("### Patterns");
    for (const p of sections.patterns) {
      parts.push(`- ${p}`);
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}

/**
 * Build a complete phase prompt by combining an agent body with variable injections.
 *
 * Takes the loaded agent prompt body (from {@link loadAgentPrompt}) and a
 * variables dictionary, then appends a `## Variables (Provided by Automation)`
 * section listing each defined variable. Undefined variables are skipped.
 *
 * @param agentBody - The markdown body of the agent prompt
 * @param variables - Key-value pairs to inject. Undefined values are omitted.
 * @returns The combined prompt string ready for SDK query()
 */
export function buildPhasePrompt(
  agentBody: string,
  variables: Record<string, string | undefined>
): string {
  const definedEntries = Object.entries(variables).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  );

  if (definedEntries.length === 0) {
    return agentBody;
  }

  const variableLines = definedEntries.map(
    ([key, value]) => `- **${key}**: ${value}`
  );

  const variablesSection = [
    "",
    "## Variables (Provided by Automation)",
    "",
    ...variableLines,
    ""
  ].join("\n");

  return agentBody + variablesSection;
}
