/** Cache-key + tool-class helpers for the MCP/WebFetch interception pipeline. */
import { parseEnvInt } from "../config/env";

/** Default cached-MCP freshness in seconds (48h). */
const MCP_TTL_DEFAULT_SEC = 172_800;
/** Default WebFetch freshness in seconds (24h, parity with Python). */
const WEBFETCH_TTL_DEFAULT_SEC = 86_400;

/** Cached-MCP freshness (ms) from `FUSE_MCP_TTL_SEC` (default 48h). */
export const MCP_TTL_MS: number = parseEnvInt(process.env.FUSE_MCP_TTL_SEC, MCP_TTL_DEFAULT_SEC) * 1000;

/** WebFetch freshness (ms) from `FUSE_WEBFETCH_TTL_SEC` (default 24h; pages stale faster than docs). */
export const WEBFETCH_TTL_MS: number = parseEnvInt(process.env.FUSE_WEBFETCH_TTL_SEC, WEBFETCH_TTL_DEFAULT_SEC) * 1000;

/** WebFetch prompt slice folded into its cache key (parity with Python prompt[:500]). */
const PROMPT_TRUNC = 500;

/** True for the WebFetch tool (exact name) or Kimi Code CLI's `FetchURL` equivalent. */
export function isWebFetch(tool: string): boolean {
  return tool === "WebFetch" || tool === "FetchURL";
}

/** MCP doc tools + WebFetch/FetchURL whose calls are cached / verbosity-capped. */
export function isMcpTool(tool: string): boolean {
  return /context7|exa|webfetch|web_fetch/i.test(tool) || isWebFetch(tool);
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
