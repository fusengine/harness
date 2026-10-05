/**
 * @module test/multi-routes
 * Which `hook <host> <scope>` processes a host spawns for one event, derived
 * from the REAL plugin declarations (fixtures copied read-only from
 * `~/.codex/plugins/cache/fusengine-codex/*` and `claude-plugins/plugins/*`).
 * Test-only: the production code never needs this (the rendezvous only serves
 * processes the host actually spawned).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIX = join(import.meta.dir, "fixtures", "multi");

/** One Codex harness declaration (plugin hooks.json line). */
interface CodexRoute { plugin: string; event: string; matcher: string | null; group: number; scope: string }
/** One Claude hooks.json command line. */
interface ClaudeLine { plugin: string; event: string; matcher: string | null; group: number; command: string }

const codexRoutes: CodexRoute[] = JSON.parse(readFileSync(join(FIX, "codex-routes.json"), "utf8"));
const claudeLines: ClaudeLine[] = JSON.parse(readFileSync(join(FIX, "claude-lines.json"), "utf8"));

/** Codex matcher aliases (codex-rs/core/src/tools/hook_names.rs:34-40,46-52 @ rust-v0.160.0). */
const CODEX_ALIASES: Record<string, string[]> = { apply_patch: ["Write", "Edit"], spawn_agent: ["Agent"] };

/**
 * Port of `matches_matcher` (codex-rs/hooks/src/events/common.rs:137-152, 165-171 @ rust-v0.160.0):
 * ""/"*" = all; only [A-Za-z0-9_|] = exact token match; else an UNANCHORED regex.
 */
export function codexMatches(matcher: string | null, inputs: string[]): boolean {
  if (matcher === null || matcher === "" || matcher === "*") return true;
  if (/^[A-Za-z0-9_|]*$/.test(matcher)) return inputs.some((i) => matcher.split("|").includes(i));
  try {
    const re = new RegExp(matcher);
    return inputs.some((i) => re.test(i));
  } catch { return false; }
}

/** Matcher inputs per event (dispatcher.rs:41-77 + events/{session_start,stop,compact}.rs matcher_input). */
function codexInputs(p: Record<string, unknown>): string[] | null {
  const ev = String(p.hook_event_name);
  if (ev === "UserPromptSubmit" || ev === "Stop") return null; // matcher ignored
  if (ev === "SessionStart") return [String(p.source ?? "startup")];
  if (ev === "SubagentStart" || ev === "SubagentStop") return [String(p.agent_type ?? "")];
  if (ev === "PreCompact" || ev === "PostCompact") return [String(p.trigger ?? "auto")];
  if (ev === "SessionEnd") return [String(p.reason ?? "other")];
  const tool = String(p.tool_name ?? "");
  return [tool, ...(CODEX_ALIASES[tool] ?? [])];
}

/** Scopes (declaration order, duplicates kept) Codex would spawn for this payload. */
export function codexScopesFor(payload: Record<string, unknown>): string[] {
  const inputs = codexInputs(payload);
  return codexRoutes
    .filter((r) => r.event === String(payload.hook_event_name))
    .filter((r) => inputs === null || codexMatches(r.matcher, inputs))
    .map((r) => r.scope);
}

/** Claude loader filter (plugin-scanner.ts matchesFilter): unanchored RegExp on tool / agent type. */
function claudeMatches(matcher: string | null, event: string, p: Record<string, unknown>): boolean {
  if (!matcher) return true;
  const value = event === "SubagentStart" || event === "SubagentStop" ? String(p.agent_type ?? "") : String(p.tool_name ?? "");
  try { return new RegExp(matcher).test(value); } catch { return false; }
}

/** Plain `hook claude-code [scope]` lines only (flags like `--sound`/env-file stay standalone). */
const PLAIN = /bin\.mjs hook claude-code(?: ([a-z]+))?(?: \|\| true)?\s*$/;

/** Scope args (undefined = bare `hook claude-code`) the Claude loader would spawn for this payload. */
export function claudeScopesFor(payload: Record<string, unknown>): (string | undefined)[] {
  const event = String(payload.hook_event_name);
  return claudeLines
    .filter((l) => l.event === event && claudeMatches(l.matcher, event, payload))
    .flatMap((l) => {
      const m = PLAIN.exec(l.command);
      return m ? [m[1]] : [];
    });
}
