/**
 * @module mcp-tool-name
 * Canonicalizes a Codex-only MCP `tool_name` alias back to its original
 * hyphenated form, so every existing dash-keyed consumer (`SHOT_TOOLS`,
 * `RESEARCH_TOOLS`/`classifyExplore`, `docSourceOf`, the design-pipeline
 * `NAV`/`SCROLL`/`GEMINI` constants, …) recognizes a Codex MCP call exactly
 * like the same call on Claude/Kimi/Cursor/Cline/Gemini — no per-consumer
 * change needed.
 *
 * Codex CLI globally rewrites every `-` to `_` across the FULL qualified MCP
 * tool identifier before it ever reaches a hook, in `sanitize_responses_api_tool_name()`
 * (`codex-rs/core/src/mcp_connection_manager.rs`, introduced by
 * openai/codex#14605 — "Normalize MCP tool names to code-mode safe form",
 * code-mode forbids `-` in identifiers). openai/codex#18385's own
 * `SCENARIO_DASH_TOOL` test proves the REWRITTEN form is what reaches hooks:
 * the `echo-tool` tool of server `rmcp` is delivered to hooks as
 * `mcp__rmcp__echo_tool`. Confirmed independently in THIS repo's terrain:
 * `~/.codex/config.toml` declares `[mcp_servers.fuse-browser]` (dash) while
 * Codex session logs and this harness's own dual-marketplace hook payloads
 * (`~/.codex/plugins/.../hooks.json` matchers) observe `mcp__fuse_browser__*`
 * (underscore) — Claude never emits that form (0 occurrences across its
 * transcripts vs 137x the dash form).
 *
 * The rewrite is deliberately NOT undone with a generic `_` -> `-` regex:
 * openai/codex#15832 and #15565 document it as NON-INVERSIBLE — a server
 * literally named `autok_local` collides with a dash-named `autok-local`
 * once both pass through the same rewrite, and OpenAI's own fix was a closed
 * canonical table, never a general regex. The SAME ambiguity exists on our
 * side: a generic reversal would corrupt tool segments that legitimately
 * contain an underscore already (`browser_screenshot`, `node_repl`,
 * `build_sim`, …). So this module only reverses the FOUR entries proven
 * above to matter to this repo's gates — every other segment passes through
 * untouched.
 * @packageDocumentation
 */

/**
 * Codex-mangled MCP server segment -> its real (dash) server name. Closed set
 * — see module doc. `Object.create(null)` (never a `{}` literal): `serverKey`
 * is an attacker-influenced string (an MCP server can register itself as
 * `"__proto__"`/`"constructor"`/`"toString"`), and a `{}`-literal lookup by
 * such a key returns the INHERITED `Object.prototype` member instead of
 * `undefined` — an object/function, so `?? serverKey` never falls back and
 * the result silently corrupts to `"mcp__[object Object]__…"` (proven in
 * `test/mcp-tool-name.test.ts`, prototype-pollution-read case). A null-
 * prototype object has no inherited members, so every lookup outside the two
 * literal keys below is a clean miss.
 */
const SERVER_ALIASES: Readonly<Record<string, string>> = Object.assign(Object.create(null), {
  fuse_browser: "fuse-browser",
  gemini_design: "gemini-design",
});

/**
 * Codex-mangled MCP tool segment -> its real (dash) tool name. Both entries
 * are `context7`-exclusive tool names — applied ONLY when the canonical
 * server is `"context7"` (see the explicit guard in
 * {@link canonicalizeMcpToolName}), never globally. A same-named tool on any
 * other server (e.g. a hypothetical `exa__query_docs`) passes through
 * untouched: openai/codex#15832 documents exactly this class of collision as
 * the reason the rewrite must stay a closed, scoped table, never a blanket
 * one. Closed set, same null-prototype rationale as {@link SERVER_ALIASES}.
 */
const TOOL_ALIASES: Readonly<Record<string, string>> = Object.assign(Object.create(null), {
  query_docs: "query-docs",
  resolve_library_id: "resolve-library-id",
});

/**
 * Canonicalize a Codex-only MCP tool-name alias to its dash form. Scoped to
 * `id === "codex"` — every other harness id passes through unchanged. The
 * server segment is rewritten via the closed {@link SERVER_ALIASES} table;
 * the tool segment is rewritten via {@link TOOL_ALIASES} ONLY when the
 * (already-resolved) canonical server is `"context7"` — every other server's
 * tool segment is left untouched even if it happens to share a name with a
 * context7 tool. Every other `mcp__<server>__<tool>` segment (or non-MCP
 * tool name) is returned byte-identical (see `test/mcp-tool-name.test.ts`
 * for the non-regression proof across ids, trap tool names, and the
 * server-scoping cases).
 * @param id - Harness adapter id (e.g. "codex", "claude-code", "kimi").
 * @param tool - Raw `tool_name` from the hook payload.
 */
export function canonicalizeMcpToolName(id: string, tool: string): string {
  if (id !== "codex") return tool;
  const parts = tool.split("__");
  if (parts.length < 3 || parts[0] !== "mcp") return tool;
  const serverKey = parts[1] ?? "";
  const toolKey = parts.slice(2).join("__");
  const server = SERVER_ALIASES[serverKey] ?? serverKey;
  const rest = server === "context7" ? (TOOL_ALIASES[toolKey] ?? toolKey) : toolKey;
  return `mcp__${server}__${rest}`;
}
