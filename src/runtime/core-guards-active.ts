/**
 * Per-harness ACTIVATION probing for the core-guards plugin, behind
 * {@link coreGuardsWired}. The owner decision: the solid scope abstains from
 * its file-size deny ONLY when core-guards is installed AND active — an
 * installed-but-disabled plugin must leave the solid deny firing. Safe
 * default, per harness: anything undetectable (unreadable/missing state)
 * reads as NOT active, so the worst case is a duplicate deny — never zero.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** File content, or null when unreadable (undetectable → caller's safe default). */
function readText(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

/** First `core-guards@…` value in a name→bool map; undefined when absent. */
function enabledEntry(map: unknown): boolean | undefined {
  if (typeof map !== "object" || map === null || Array.isArray(map)) return undefined;
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    if (k.startsWith("core-guards@")) return v !== false;
  }
  return undefined;
}

/**
 * Claude Code: `~/.claude/settings.json` → `enabledPlugins`. core-guards is a
 * REQUIRED marketplace plugin: no entry means active whenever the marketplace
 * copy exists (`installed`); an explicit `false` means disabled. Unreadable
 * settings → false (undetectable).
 * @param home - OS home.
 * @param installed - Whether the marketplace copy of core-guards exists.
 */
export function claudeCoreGuardsActive(home: string, installed: boolean): boolean {
  const text = readText(join(home, ".claude", "settings.json"));
  if (text === null) return false;
  try {
    const entry = enabledEntry((JSON.parse(text) as { enabledPlugins?: unknown }).enabledPlugins);
    return entry ?? installed;
  } catch { return false; }
}

/**
 * Codex: `[plugins."core-guards@<mkt>"] enabled = …` in `~/.codex/config.toml`
 * (minimal section-scoped extraction — no TOML dependency). Missing section,
 * `enabled = false`, or unreadable file → false.
 * @param home - OS home.
 */
export function codexCoreGuardsActive(home: string): boolean {
  const text = readText(join(home, ".codex", "config.toml"));
  if (text === null) return false;
  // `^` + `m`: the header must start a real line — an inert one-line comment
  // like `# [plugins."core-guards@mkt"] enabled = true` must never match
  // (verified: without the anchor it does, flipping this to a false "active"
  // and silencing the solid file-size deny — the owner's "never zero deny").
  const m = /^\[plugins\."core-guards@[^"]+"\]\s*enabled\s*=\s*(true|false)/m.exec(text);
  return m?.[1] === "true";
}

/**
 * Kimi: `<KIMI_CODE_HOME>/plugins/installed.json` — map form (`id →
 * {enabled?}`) or array form (`[{id, enabled?}]`); an entry counts active
 * unless `enabled === false`. File absent here today → format read
 * tolerantly; missing/unreadable → false (undetectable).
 * @param root - Kimi data root (`KIMI_CODE_HOME` ?? `~/.kimi-code`).
 */
export function kimiCoreGuardsActive(root: string): boolean {
  const text = readText(join(root, "plugins", "installed.json"));
  if (text === null) return false;
  try {
    const data = (JSON.parse(text) as { plugins?: unknown }).plugins;
    if (Array.isArray(data)) {
      const hit = data.find((p) => typeof p === "object" && p !== null && (p as { id?: unknown }).id === "core-guards");
      return hit !== undefined && (hit as { enabled?: unknown }).enabled !== false;
    }
    if (typeof data !== "object" || data === null) return false;
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (k === "core-guards" || k.startsWith("core-guards@")) {
        return typeof v === "object" && v !== null ? (v as { enabled?: unknown }).enabled !== false : v !== false;
      }
    }
    return false;
  } catch { return false; }
}
