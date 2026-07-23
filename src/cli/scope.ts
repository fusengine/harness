/**
 * CLI scope argument parsing for `harness hook <id> [scope]`. The scope set is
 * closed (plugin-scoped lifecycle behaviors); an unknown value historically
 * fell back to `"core"` SILENTLY, which made a typo'd plugin name apply the
 * core guards with no sign of the mistake. The fallback stays (wiring
 * compatibility) but now warns on stderr — harnesses never parse stderr, so
 * the wire contract is untouched.
 */
import type { PluginScope } from "../runtime/lifecycle";

/** Closed set of plugin scopes accepted after `harness hook <id>`. */
const VALID_SCOPES = new Set<string>([
  "solid", "rules", "carto", "security", "changelog",
  "aipilot", "lessons", "seo", "memory", "tailwindcss",
]);

/**
 * Parse the optional scope argument.
 * @param scopeArg - `process.argv[4]`, when present.
 * @param err - Warning sink (defaults to stderr; injectable for tests).
 * @returns The valid scope, or `"core"` (with a warning) otherwise.
 */
export function parseScope(
  scopeArg: string | undefined,
  err: (msg: string) => void = (m) => process.stderr.write(m),
): PluginScope {
  if (scopeArg !== undefined && scopeArg !== "core" && !VALID_SCOPES.has(scopeArg)) {
    err(`harness: unknown scope "${scopeArg}", falling back to "core"\n`);
  }
  return scopeArg !== undefined && VALID_SCOPES.has(scopeArg) ? (scopeArg as PluginScope) : "core";
}
