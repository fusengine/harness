/**
 * @module screenshot-tools
 * Screenshot-credit tool set (C1), split out of `runtime/design-helpers.ts` to
 * keep that file within the SOLID size budget (SRP).
 * @packageDocumentation
 */

/**
 * Screenshot-credit tools: the single-shot capture PLUS the two fuse-browser
 * batch capture primitives (`browser_shots_batch`, `browser_site_shots`) — a
 * batch call that captures N urls/viewports must credit the quota too, or
 * capturing efficiently would make the quota infranchissable. LIMITATION
 * (deliberate, documented): this repo's cross-harness `NormalizedEvent` (see
 * `runtime/normalize.ts`) never surfaces `tool_response` for any tool — by
 * design, since its shape is undocumented for MCP tools and harness-specific
 * for built-ins — so no per-call item count reaches this gate. A batch call
 * therefore credits EXACTLY 1, same as a unit screenshot, never the N it may
 * have captured.
 */
export const SHOT_TOOLS: ReadonlySet<string> = new Set([
  "mcp__fuse-browser__browser_screenshot",
  "mcp__fuse-browser__browser_shots_batch",
  "mcp__fuse-browser__browser_site_shots",
]);
