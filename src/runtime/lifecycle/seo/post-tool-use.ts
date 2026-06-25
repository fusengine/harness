/**
 * SEO PostToolUse handler (fs effects). Ports `seo/hooks/validate-seo.ts`: on an
 * edited HTML-like file under a `.fuse-seo` marker, deny when SEO elements are
 * missing. Opt-in only — silent when no marker / non-HTML / file unreadable.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { isHtmlLike, missingSeoElements } from "../../../policy/seo/validate";
import { denyResponse } from "../../../adapters/claude";
import { walkUpFor } from "../../../util/project-root";

/**
 * Validate the edited file's SEO completeness. Returns a deny message (for a
 * `permissionDecision: deny` response) when HTML-like, opted-in, and missing
 * elements; otherwise `null` (allow).
 * @param payload - The raw PostToolUse payload.
 * @returns The deny reason string, or `null` to allow.
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
 * SEO PostToolUse as a ready native response: a `permissionDecision: deny`
 * string when the edited file is missing SEO elements, else `null` (allow).
 * @param payload - The raw PostToolUse payload.
 * @returns The deny response string, or `null` to allow.
 */
export function seoPostToolUseResponse(payload: Record<string, unknown>): string | null {
  const deny = seoPostToolUse(payload);
  return deny ? denyResponse("PostToolUse", deny) : null;
}
