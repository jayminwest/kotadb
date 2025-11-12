/**
 * Common schema patterns for command outputs
 *
 * Reusable schema helpers for frequent validation patterns
 */

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "validation-common-schemas" });

/**
 * Validates relative file paths (no leading slash)
 * Optionally validates file extension
 *
 * @example
 * FilePathOutput(".md") validates "docs/plan.md" but not "/docs/plan.md" or "docs/plan.txt"
 */
export function FilePathOutput(extension?: string): object {
  let pattern = "^[^/]";  // No leading slash

  if (extension) {
    // Escape dots in extension and add to pattern
    const escapedExt = extension.replace(/\./g, "\\.");
    pattern = `^[^/].*${escapedExt}$`;
  }

  return {
    type: "string",
    pattern
  };
}

/**
 * Validates JSON structure with optional markdown code block extraction
 *
 * Accepts either raw JSON or JSON wrapped in markdown code blocks
 *
 * @param jsonSchema - The JSON schema to validate the extracted JSON against
 * @example
 * JSONBlockOutput({ type: "object", properties: { name: { type: "string" } } })
 */
export function JSONBlockOutput(jsonSchema: object): object {
  return jsonSchema;
}

/**
 * Validates markdown with specific section requirements
 *
 * @param requiredSections - Array of section titles that must be present (e.g., ["## Summary", "## Details"])
 * @example
 * MarkdownSectionOutput(["## Summary", "## Test Plan"])
 */
export function MarkdownSectionOutput(requiredSections: string[]): object {
  // Build pattern that checks for each required section
  // This is a simplified pattern - full markdown validation would be more complex
  const sectionPatterns = requiredSections
    .map((section) => `(?=.*${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`)
    .join("");

  return {
    type: "string",
    pattern: `^${sectionPatterns}[\\s\\S]*$`
  };
}

/**
 * Validates plain text with optional length/format constraints
 *
 * @param options - Validation options (minLength, maxLength, pattern)
 * @example
 * PlainTextOutput({ maxLength: 72, pattern: "^(feat|fix|chore).*" })
 */
export function PlainTextOutput(options?: {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}): object {
  const schema: any = {
    type: "string"
  };

  if (options?.minLength !== undefined) {
    schema.minLength = options.minLength;
  }

  if (options?.maxLength !== undefined) {
    schema.maxLength = options.maxLength;
  }

  if (options?.pattern) {
    schema.pattern = options.pattern;
  }

  return schema;
}
