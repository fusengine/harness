/** Cache-key + tool-class helpers for the MCP/WebFetch interception pipeline. */

/** Default freshness for cached MCP doc results (48h). */
export const MCP_TTL_MS = 172_800_000;

/** WebFetch freshness — pages go stale faster than docs (24h, parity with Python). */
export const WEBFETCH_TTL_MS = 86_400_000;

/** WebFetch prompt slice folded into its cache key (parity with Python prompt[:500]). */
const PROMPT_TRUNC = 500;

/** True for the WebFetch tool (exact name). */
export function isWebFetch(tool: string): boolean {
  return tool === "WebFetch";
}

/** MCP doc tools + WebFetch whose calls are cached / verbosity-capped. */
export function isMcpTool(tool: string): boolean {
  return /context7|exa|webfetch|web_fetch/i.test(tool) || tool === "WebFetch";
}

/** The query/url that keys the cache. */
export function queryOf(input: Record<string, unknown>): string {
  const q = input.query ?? input.url ?? input.libraryId ?? "";
  return typeof q === "string" ? q : JSON.stringify(q);
}

/**
 * The string that keys the cache for `tool`. WebFetch folds `url + "\n" +
 * prompt[:500]` (parity with Python) so distinct prompts on the same URL never
 * collide; every other tool keys on {@link queryOf}.
 */
export function cacheQueryOf(tool: string, input: Record<string, unknown>): string {
  if (!isWebFetch(tool)) return queryOf(input);
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  return `${url}\n${prompt.slice(0, PROMPT_TRUNC)}`;
}
