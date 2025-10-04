const IMPORT_PATTERN = /(?:import|export)\s+[^\n;'"`]*?from\s+["'`](.+?)["'`]/g;
const DYNAMIC_IMPORT_PATTERN = /import\((?:[^'"`]*?)["'`](.+?)["'`]\)/g;
const REQUIRE_PATTERN = /require\((?:[^'"`]*?)["'`](.+?)["'`]\)/g;

export function extractDependencies(source: string): string[] {
  const dependencies = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    dependencies.add(match[1] ?? "");
  }

  while ((match = DYNAMIC_IMPORT_PATTERN.exec(source)) !== null) {
    dependencies.add(match[1] ?? "");
  }

  while ((match = REQUIRE_PATTERN.exec(source)) !== null) {
    dependencies.add(match[1] ?? "");
  }

  dependencies.delete("");

  return Array.from(dependencies.values()).sort();
}

export function buildSnippet(content: string, needle: string, radius = 60): string {
  const compact = content.replace(/\s+/g, " ");
  const lowerNeedle = needle.toLowerCase();
  const index = compact.toLowerCase().indexOf(lowerNeedle);

  if (index === -1) {
    return truncate(compact, radius * 2);
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(compact.length, index + lowerNeedle.length + radius);

  const prefix = start > 0 ? "…" : "";
  const suffix = end < compact.length ? "…" : "";

  return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
}

function truncate(text: string, length: number): string {
  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length).trimEnd()}…`;
}
