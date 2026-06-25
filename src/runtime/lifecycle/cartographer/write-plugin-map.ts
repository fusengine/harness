/**
 * Per-plugin map writer (fs). Ports `write_plugin_map.py`: writes a level-2
 * `<plugin>/index.md` (indented linked tree) then recurses agents/skills/
 * commands into deeper index trees. Reuses `buildTree`, `mergeLines`, `writeTree`.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTree, type ScanRow } from "../../../policy/cartographer/build-tree";
import { mergeLines } from "./merge";
import { writeTree } from "./write-tree";

/** True when `dir` is a real directory. */
function isDir(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Write `<outputDir>/<pluginName>/index.md` (indented linked tree) and recurse
 * agents/skills/commands into their own index trees rooted there.
 * @param outputDir - The map root directory.
 * @param pluginName - Display name of the plugin (the index subfolder).
 * @param version - Plugin version ("" to omit).
 * @param items - The scanned `[type, name, desc]` rows.
 * @param pluginPath - Absolute source plugin directory (for recursion).
 */
export function writePluginMap(outputDir: string, pluginName: string, version: string, items: ReadonlyArray<ScanRow>, pluginPath: string): void {
  const pluginDir = join(outputDir, pluginName);
  mkdirSync(pluginDir, { recursive: true });
  const ver = version ? ` (v${version})` : "";
  const tree = items.length ? buildTree(items, true) : "└── (empty)";
  const newLines = `# ${pluginName}${ver}\n\n${tree}`.split("\n");
  const indexPath = join(pluginDir, "index.md");
  writeFileSync(indexPath, mergeLines(newLines, indexPath).join("\n") + "\n", "utf-8");

  for (const section of ["agents", "skills", "commands"]) {
    const src = join(pluginPath, section);
    if (isDir(src)) writeTree(src, join(pluginDir, section), "../index.md");
  }
}
