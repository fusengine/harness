/**
 * Plugin scanning (fs). Ports `scan_plugins.py`: turns a plugin's
 * agents/skills/commands/hooks into ordered `[type, name, desc]` rows.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { ScanRow } from "../../../policy/cartographer/build-tree";
import { parseBodyDesc, parseField } from "../../../policy/cartographer/frontmatter";
import { scanHooks } from "./scan-hooks";

/** Sorted entry names of `dir` (alpha, byte-order), or `[]` on error. */
function sortedNames(dir: string): string[] {
  try {
    return readdirSync(dir).sort((a, b) => a.localeCompare(b, "en"));
  } catch {
    return [];
  }
}

/** Read a `.md` frontmatter field from a file path, "" when missing/unreadable. */
function fileField(path: string, field: string): string {
  try {
    return parseField(readFileSync(path, "utf-8"), field);
  } catch {
    return "";
  }
}

/** Scan `agents/*.md` → `("agent", name, desc[:50])` rows. */
export function scanAgents(root: string): ScanRow[] {
  const dir = join(root, "agents");
  return sortedNames(dir)
    .filter((n) => extname(n) === ".md")
    .map((n): ScanRow => {
      const f = join(dir, n);
      const name = fileField(f, "name") || n.replace(/\.md$/, "");
      return ["agent", name, fileField(f, "description").slice(0, 50)];
    });
}

/** Scan `skills/<dir>/SKILL.md` → `("skill", dir, desc)` rows. */
function scanSkills(root: string): ScanRow[] {
  const dir = join(root, "skills");
  const rows: ScanRow[] = [];
  for (const name of sortedNames(dir)) {
    try {
      if (!statSync(join(dir, name)).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillMd = join(dir, name, "SKILL.md");
    let desc = "";
    if (existsSync(skillMd)) {
      desc = fileField(skillMd, "description");
      if (!desc) {
        try {
          desc = parseBodyDesc(readFileSync(skillMd, "utf-8"));
        } catch { /* keep "" */ }
      }
    }
    rows.push(["skill", name, desc || "(no description)"]);
  }
  return rows;
}

/** Scan `commands/*.md` → `("command", "/name", desc[:50])` rows. */
function scanCommands(root: string): ScanRow[] {
  const dir = join(root, "commands");
  return sortedNames(dir)
    .filter((n) => extname(n) === ".md")
    .map((n): ScanRow => ["command", `/${n.replace(/\.md$/, "")}`, fileField(join(dir, n), "description").slice(0, 50)]);
}

/**
 * Scan a single plugin directory into ordered `[type, name, desc]` rows.
 * @param pluginDir - Absolute plugin directory.
 * @returns The agents + skills + commands + hooks rows.
 */
export function scanPlugin(pluginDir: string): ScanRow[] {
  return [...scanAgents(pluginDir), ...scanSkills(pluginDir), ...scanCommands(pluginDir), ...scanHooks(pluginDir)];
}
