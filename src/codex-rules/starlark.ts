import type { CodexPrefixRule } from "./types";

/**
 * Neutralize characters that would break out of a Starlark `#` line comment
 * (a bare `\n`/`\r` in an interpolated label/reason would start a new line
 * no longer prefixed by `#`, corrupting the generated file).
 */
export function sanitizeComment(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

/** Render a string array as a Starlark list literal (double-quoted strings). */
function starlarkList(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
}

/** Render one pattern element: a bare token, or a `[...]` alternation. */
function starlarkPatternElement(el: string | string[]): string {
  return Array.isArray(el) ? starlarkList(el) : JSON.stringify(el);
}

/**
 * Render a single `CodexPrefixRule` as a Starlark `prefix_rule(...)` call,
 * prefixed by a traceability comment pointing back at its `security.ts` label.
 */
export function renderPrefixRule(rule: CodexPrefixRule): string {
  const pattern = `[${rule.pattern.map(starlarkPatternElement).join(", ")}]`;
  const lines = [
    `# source: security.ts label "${sanitizeComment(rule.sourceLabel)}"`,
    "prefix_rule(",
    `    pattern = ${pattern},`,
    `    decision = "${rule.decision}",`,
    `    justification = ${JSON.stringify(rule.justification)},`,
    `    match = ${starlarkList(rule.match)},`,
  ];
  if (rule.notMatch && rule.notMatch.length > 0) {
    lines.push(`    not_match = ${starlarkList(rule.notMatch)},`);
  }
  lines.push(")");
  return lines.join("\n");
}

/** Render a list of rules, each block separated by a blank line. */
export function renderPrefixRules(rules: CodexPrefixRule[]): string {
  return rules.map(renderPrefixRule).join("\n\n");
}
