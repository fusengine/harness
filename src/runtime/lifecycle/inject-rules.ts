import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderInform } from "../inform";
import { rulesInAgentsMd } from "./kimi-rules-native";

/** Read & concatenate all `*.md` files (sorted) under `rulesDir`. */
export function readRules(rulesDir: string): string {
  if (!existsSync(rulesDir)) return "";
  let names: string[];
  try {
    names = readdirSync(rulesDir).filter((n) => n.endsWith(".md")).sort();
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const name of names) {
    try {
      parts.push(readFileSync(join(rulesDir, name), "utf-8"));
    } catch {
      /* skip unreadable rule file */
    }
  }
  return parts.join("\n\n");
}

/**
 * Build the rules injection for claude-rules (SessionStart, UserPromptSubmit,
 * SubagentStart): read `<pluginRoot>/rules/*.md` and emit via {@link renderInform}
 * (Claude-shaped `additionalContext`, or raw text for kimi). Tags the output
 * with the *actual* `hookEventName` — the spec requires it to match the firing
 * event (a hardcoded "SessionStart" is non-conforming and may be dropped on
 * UserPromptSubmit/SubagentStart).
 *
 * On kimi's `UserPromptSubmit` specifically, when the corpus is already fenced
 * inside `<kimiHome>/AGENTS.md` (native load, {@link rulesInAgentsMd}), only the
 * notice is emitted — the re-injected corpus would otherwise dump into the
 * user's terminal on every single prompt for no model-context benefit.
 * `SessionStart`/`SubagentStart` always keep the full corpus (session bootstrap
 * / sub-agent contexts need it regardless of the native AGENTS.md load).
 * @param pluginRoot - `CLAUDE_PLUGIN_ROOT` of the claude-rules plugin.
 * @param event - The firing hook event name (e.g. "SessionStart").
 * @param id - Harness target id (defaults to "claude-code" — zero-regression default).
 * @returns The native hook stdout (possibly empty).
 */
export function injectRules(pluginRoot: string, event: string, id: string = "claude-code"): string {
  const content = readRules(join(pluginRoot, "rules"));
  if (!content) return "";
  if (id === "kimi" && event === "UserPromptSubmit" && rulesInAgentsMd()) return "rules 00-08 injected";
  return renderInform(id, event, content, "rules 00-08 injected");
}
