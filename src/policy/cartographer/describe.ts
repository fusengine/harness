/**
 * File-description heuristics — pure text in, description out (no fs). Ports
 * `describe.py`.
 */

const SOURCE_SUFFIXES: ReadonlySet<string> = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".swift"]);

/**
 * First `# ` Markdown heading text (sans hashes), sliced to 60. "" when none.
 * @param text - The document text.
 * @returns The heading text, or "".
 */
export function firstHeading(text: string): string {
  for (const line of text.split("\n")) {
    if (line.startsWith("# ")) return line.replace(/^#+/, "").trim().slice(0, 60);
  }
  return "";
}

/**
 * First leading comment among the first 10 lines (`//`, `#` but not `#!`, or a
 * `"""`/`'''` docstring), sliced to 60. "" when none.
 * @param text - The source text.
 * @returns The comment text, or "".
 */
export function firstComment(text: string): string {
  const lines = text.split("\n").slice(0, 10);
  for (const raw of lines) {
    const line = raw.trim();
    if ((line.startsWith("//") || line.startsWith("#")) && !line.startsWith("#!")) {
      return line.replace(/^[/#! ]+/, "").slice(0, 60);
    }
    if (line.startsWith('"""') || line.startsWith("'''")) {
      return line.replace(/^['"\s]+|['"\s]+$/g, "").slice(0, 60);
    }
  }
  return "";
}

/**
 * Derive a description from a file's suffix + text. For `.md`, the supplied
 * frontmatter `description` (truncated) wins over the first heading; for known
 * source suffixes, the first comment; else "".
 * @param suffix - The file extension (with dot).
 * @param text - The file text.
 * @param mdField - The pre-parsed frontmatter `description` (md only).
 * @returns The derived description, or "".
 */
export function descFromText(suffix: string, text: string, mdField: string): string {
  if (suffix === ".md") return mdField.slice(0, 60) || firstHeading(text);
  if (SOURCE_SUFFIXES.has(suffix)) return firstComment(text);
  return "";
}
