import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contextResponse } from "../../adapters/claude";

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
 * Build the rules injection for claude-rules (SessionStart + UserPromptSubmit):
 * read `<pluginRoot>/rules/*.md` and emit as `additionalContext`, or "" when no
 * rules. Ports `claude-rules/scripts/inject-rules.py` (which always tags the
 * output `hookEventName: "SessionStart"`, even on UserPromptSubmit).
 * @param pluginRoot - `CLAUDE_PLUGIN_ROOT` of the claude-rules plugin.
 * @returns The native hook stdout (possibly empty).
 */
export function injectRules(pluginRoot: string): string {
  const content = readRules(join(pluginRoot, "rules"));
  return content ? contextResponse("SessionStart", content) : "";
}
