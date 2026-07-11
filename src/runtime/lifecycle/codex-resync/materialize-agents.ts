import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { clearManagedDestination, MANAGED_AGENT_MARKER } from "./managed-destination";
import type { PluginFile } from "./plugin-files";

const PORTABLE_SKILL_PATH_RE = /^plugins\/([^/]+)\/skills\/(.+)$/;
const CACHE_SKILL_PATH_RE = /\/\.codex\/plugins\/cache\/fusengine-codex\/([^/]+)\/[^/]+\/skills\/(.+)$/;

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Rewrite one `path = "..."` value to an absolute path (portable/cache skill refs, or relative-to-source). */
function rewriteAgentSkillPath(value: string, item: PluginFile, pluginRoots: Map<string, string>): string {
  const portable = PORTABLE_SKILL_PATH_RE.exec(value);
  if (portable) {
    const root = pluginRoots.get(portable[1] ?? "");
    return root ? join(root, "skills", portable[2] ?? "") : value;
  }
  const cached = CACHE_SKILL_PATH_RE.exec(value);
  if (cached) {
    const root = pluginRoots.get(cached[1] ?? "");
    return root ? join(root, "skills", cached[2] ?? "") : value;
  }
  if (value.startsWith("./") || value.startsWith("../")) return resolve(dirname(item.src), value);
  return value;
}

/** Rewrite every `path = "..."` line in an agent TOML + stamp the managed-source marker. */
export function materializeAgentToml(raw: string, item: PluginFile, pluginRoots: Map<string, string>): string {
  const rewritten = raw.replace(/^(\s*path\s*=\s*)"([^"]+)"/gm, (_m, prefix: string, value: string) =>
    `${prefix}${tomlString(rewriteAgentSkillPath(value, item, pluginRoots))}`);
  return rewritten.startsWith(MANAGED_AGENT_MARKER) ? rewritten : `${MANAGED_AGENT_MARKER} ${item.src}\n${rewritten}`;
}

/**
 * Materialize agent TOMLs into `destDir` (Codex ignores symlinked agent
 * TOMLs — openai/codex#15345, never fixed — so these are COPIED, not linked).
 * Silent: no `@clack/prompts` (this always runs inside a hook, which must
 * stay stdout-clean). Ports `agent-materializer.ts::materializeAgentFiles`.
 * @param files - Discovered agent files (see {@link import("./plugin-files").listPluginFiles}).
 * @param destDir - Destination dir (`<codexHome>/agents`).
 * @param pluginRoots - Resolved plugin roots, for `path=` rewriting.
 */
export function materializeAgentFiles(files: PluginFile[], destDir: string, pluginRoots: Map<string, string>): void {
  mkdirSync(destDir, { recursive: true });
  const seen = new Set<string>();
  for (const item of files) {
    if (seen.has(item.file)) continue;
    seen.add(item.file);
    clearManagedDestination(join(destDir, `${item.plugin}-${item.file}`)); // legacy naming cleanup
    const destPath = join(destDir, item.file);
    if (clearManagedDestination(destPath) === "skip") continue;
    const raw = readFileSync(item.src, "utf8");
    writeFileSync(destPath, materializeAgentToml(raw, item, pluginRoots));
  }
}
