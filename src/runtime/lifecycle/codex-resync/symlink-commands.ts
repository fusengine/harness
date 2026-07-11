import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { clearManagedDestination } from "./managed-destination";
import type { PluginFile } from "./plugin-files";

/**
 * Symlink command files (`.md`) into `destDir` — unlike agents, Codex has no
 * known symlink-loading issue for prompts, so these stay linked rather than
 * copied. Silent, no `@clack/prompts` (see {@link materializeAgentFiles} for
 * why). Ports `plugin-file-symlinks.ts::symlinkPluginFiles`.
 * @param files - Discovered command files (see {@link import("./plugin-files").listPluginFiles}).
 * @param destDir - Destination dir (`<codexHome>/prompts`).
 */
export function symlinkPluginFiles(files: PluginFile[], destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const seen = new Set<string>();
  for (const item of files) {
    if (seen.has(item.file)) continue;
    seen.add(item.file);
    clearManagedDestination(join(destDir, `${item.plugin}-${item.file}`)); // legacy naming cleanup
    const linkPath = join(destDir, item.file);
    if (clearManagedDestination(linkPath) === "skip") continue;
    symlinkSync(item.src, linkPath);
  }
}
