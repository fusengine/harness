import { homedir } from "node:os";
import { join } from "node:path";
import { acquireResyncLock, releaseResyncLock } from "./lock";
import { needsResync, resolveCurrentFingerprint, writeFingerprint } from "./fingerprint";
import { pluginsCacheRoot } from "./plugin-roots";
import { listPluginFiles } from "./plugin-files";
import { materializeAgentFiles } from "./materialize-agents";
import { symlinkPluginFiles } from "./symlink-commands";

/** The Codex home dir: `$CODEX_HOME`, else `~/.codex`. */
export function defaultCodexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

/**
 * Re-materialize the Codex plugin agents/commands cache on SessionStart, but
 * only when the plugin-cache fingerprint changed (or a command symlink dangles)
 * since the last apply — otherwise a cheap no-op. Agents are COPIED into
 * `<codexHome>/agents` (Codex won't load symlinked agent TOMLs), commands are
 * SYMLINKED into `<codexHome>/prompts`. Guarded by a best-effort inter-process
 * lock so two sessions starting at once can't write a torn cache; the sha256
 * fingerprint is the real correctness backstop (idempotent skip), the lock only
 * reduces redundant concurrent rebuilds. ABSOLUTELY fail-open: any error is
 * swallowed so a resync can never break SessionStart.
 * @param codexHome - The Codex home directory (defaults to {@link defaultCodexHome}).
 */
export function resyncCodexAgents(codexHome: string = defaultCodexHome()): void {
  try {
    const pluginsRoot = pluginsCacheRoot(codexHome);
    const current = resolveCurrentFingerprint(pluginsRoot);
    if (!current) return; // nothing cached — the installer, not this hook, owns first-time setup
    const promptsDir = join(codexHome, "prompts");
    if (!needsResync(codexHome, current.value, promptsDir)) return; // unchanged since last apply — no-op
    if (!acquireResyncLock(codexHome)) return; // another session already holds the resync lock
    try {
      materializeAgentFiles(listPluginFiles(pluginsRoot, "agents", ".toml"), join(codexHome, "agents"), current.roots);
      symlinkPluginFiles(listPluginFiles(pluginsRoot, "commands", ".md"), promptsDir);
      writeFingerprint(codexHome, current.value);
    } finally {
      releaseResyncLock(codexHome); // best-effort, never throws (see lock.ts)
    }
  } catch {
    /* absolute fail-open: a resync must never break SessionStart */
  }
}
