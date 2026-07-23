/**
 * PostToolUse (matcher "Write|Edit") for the ai-pilot scope: validate SOLID
 * file-size and interface-location compliance right after a code write.
 * Ports `check-solid-compliance.py`.
 */
import { readText, pathExists } from "../../../util/runtime-io";
import { contextResponse } from "../../../adapters/claude";
import { resolveMaxLines, splitTarget } from "../../../config/limits";
import { maskCommentsAndStrings } from "../../../policy/conventions/strip";
import { isVendorPath } from "../../../policy/conventions/langs";

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|php|swift|go|rs|rb|java|astro)$/;
const COMPONENT_DIR = /\/(components|pages|views)\//;
const BACKEND_DIR = /\/(Controllers|Models|Services)\//;
const TS_INTERFACE_RE = /^(export )?(interface|type) [A-Z]/m;
const PHP_INTERFACE_RE = /^interface /m;

/** Count non-empty, non-comment (`//`/`#`/`*`-prefixed) lines. Shared with {@link checkSolidFromTranscript}. */
export function countCodeLines(content: string): number {
  let count = 0;
  for (const raw of content.split("\n")) {
    const s = raw.trim();
    if (!s || s.startsWith("//") || s.startsWith("#") || s.startsWith("*")) continue;
    count++;
  }
  return count;
}

/**
 * Validate SOLID compliance for a just-written file.
 * @param payload - The raw PostToolUse hook payload (`tool_name`, `tool_input.file_path`).
 * @returns The PostToolUse `additionalContext` response, or `""` when clean/not applicable.
 */
export function checkSolidCompliance(payload: Record<string, unknown>): string {
  const tool = String(payload.tool_name ?? "");
  if (tool !== "Write" && tool !== "Edit") return "";
  const input = (payload.tool_input as Record<string, unknown> | undefined) ?? {};
  const filePath = typeof input.file_path === "string" ? input.file_path : "";
  if (!filePath || !CODE_EXTENSIONS.test(filePath) || !pathExists(filePath)) return "";
  if (isVendorPath(filePath)) return ""; // dependency/build dirs are never convention-gated

  let content: string;
  try {
    content = readText(filePath);
  } catch {
    return "";
  }

  const violations: string[] = [];
  const max = resolveMaxLines();
  const split = splitTarget(max);
  const lc = countCodeLines(content);
  if (lc > max) violations.push(`FILE SIZE: ${lc} lines (max: ${max})`);
  else if (lc > split) violations.push(`FILE SIZE WARNING: ${lc} lines (split at ${split})`);

  // Per-extension matching on MASKED content (no cross-language regex bleed,
  // no comment/string false positives).
  const masked = maskCommentsAndStrings(content, filePath.endsWith(".php") ? "php" : filePath.endsWith(".py") ? "py" : "c");
  if (COMPONENT_DIR.test(filePath) && /\.(ts|tsx|js|jsx|astro)$/.test(filePath)) {
    if (TS_INTERFACE_RE.test(masked)) violations.push("INTERFACE LOCATION: Move to src/interfaces/");
  } else if (BACKEND_DIR.test(filePath) && filePath.endsWith(".php")) {
    if (PHP_INTERFACE_RE.test(masked)) violations.push("INTERFACE LOCATION: Move to app/Contracts/");
  }

  if (violations.length === 0) return "";
  const name = filePath.split("/").pop() ?? filePath;
  const message = `SOLID COMPLIANCE CHECK: ${name}\n\n${violations.join("\n")}\nINSTRUCTION: Fix violations before continuing.\nRun sniper agent for full validation.`;
  return contextResponse("PostToolUse", message);
}
