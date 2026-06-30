/**
 * SEO PostToolUse handler (fs effects). Ports `seo/hooks/validate-seo.ts`: on an
 * edited HTML-like file under a `.fuse-seo` marker, deny when SEO elements are
 * missing. Opt-in only — silent when no marker / non-HTML / file unreadable.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { isHtmlLike, missingSeoElements } from "../../../policy/seo/validate";
import { blockResponse } from "../../../adapters/claude";
import { walkUpFor } from "../../../util/project-root";

/**
 * Validate the edited file's SEO completeness. Returns a block message (for a
 * top-level `decision: block` response) when HTML-like, opted-in, and missing
 * elements; otherwise `null` (allow).
 * @param payload - The raw PostToolUse payload.
 * @returns The block reason string, or `null` to allow.
 */
export function seoPostToolUse(payload: Record<string, unknown>): string | null {
  const input = payload.tool_input as { file_path?: string } | undefined;
  const path = input?.file_path;
  if (!path || !isHtmlLike(path)) return null;
  const cwd = typeof payload.cwd === "string" ? payload.cwd : dirname(path);
  if (!walkUpFor(cwd, ".fuse-seo")) return null;
  try {
    const missing = missingSeoElements(readFileSync(path, "utf-8"));
    if (missing.length === 0) return null;
    return `fuse-seo: missing SEO elements in ${path}:\n  - ${missing.join("\n  - ")}`;
  } catch {
    return null;
  }
}

/**
 * SEO PostToolUse as a ready native response: a top-level `decision: block`
 * string when the edited file is missing SEO elements, else `null` (allow).
 * PostToolUse ignores `permissionDecision` (PreToolUse-only), so this must use
 * the `decision`/`reason` keys to actually feed the failure back to Claude.
 * @param payload - The raw PostToolUse payload.
 * @returns The block response string, or `null` to allow.
 */
export function seoPostToolUseResponse(payload: Record<string, unknown>): string | null {
  const block = seoPostToolUse(payload);
  return block ? blockResponse(block) : null;
}
