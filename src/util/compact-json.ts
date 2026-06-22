/**
 * Compact JSON serializer for cache/state files.
 * Top-level keys are indented one per line; nested objects/arrays render inline.
 * Behaviour preserved from the fusengine hooks.
 */
export function compactJson(data: unknown): string {
  if (typeof data !== "object" || data === null) return `${JSON.stringify(data)}\n`;
  if (Array.isArray(data)) {
    if (data.length === 0) return "[]\n";
    const items = data.map((item) => `  ${JSON.stringify(item)}`);
    return `[\n${items.join(",\n")}\n]\n`;
  }
  const lines: string[] = [];
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(val) && val.length > 0) {
      const items = val.map((item) => `    ${JSON.stringify(item)}`);
      lines.push(`  "${key}": [\n${items.join(",\n")}\n  ]`);
    } else {
      lines.push(`  "${key}": ${JSON.stringify(val)}`);
    }
  }
  return `{\n${lines.join(",\n")}\n}\n`;
}
