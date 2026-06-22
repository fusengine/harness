const MAX_DEPTH = 5;

interface TextBlock {
  type?: string;
  text?: string;
}

/**
 * Extract usable markdown from an MCP `tool_response`: a string, a list of
 * content blocks (non-text blocks skipped), or any JSON structure (fallback).
 * Recurses up to depth 5 to guard against pathological/cyclic structures.
 */
export function extractText(resp: unknown, depth = 0): string {
  if (depth >= MAX_DEPTH) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) {
    const parts = resp
      .filter((b): b is TextBlock => typeof b === "object" && b !== null)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "");
    if (parts.length) return parts.join("\n\n");
    const nested = resp
      .filter((b) => Array.isArray(b) || (typeof b === "object" && b !== null))
      .map((b) => extractText(b, depth + 1));
    const joined = nested.filter(Boolean).join("\n\n");
    if (joined) return joined;
  }
  if (!resp) return "";
  try {
    return JSON.stringify(resp);
  } catch {
    return "";
  }
}
