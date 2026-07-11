/**
 * @module notification-sound
 * Resolve the on-disk sound file for a hook notification kind: a per-kind env
 * override, else the package's own `assets/song/` bundle, else a plugin-root
 * fallback. Returns an absolute path or `null` ("stay silent"). NEVER throws.
 * @packageDocumentation
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runningVersion } from "../cli/doctor";

/** Notification kinds the harness can voice. */
export type SoundKind = "stop" | "permission" | "human";

/** Kind → asset filename (under `assets/song/` and the plugin-root fallback). */
const FILES: Record<SoundKind, string> = { stop: "finish.mp3", permission: "permission-need.mp3", human: "need-human.mp3" };

/** Kind → env var holding an explicit override path. */
const ENV_VARS: Record<SoundKind, string> = { stop: "FUSE_HARNESS_SOUND_STOP", permission: "FUSE_HARNESS_SOUND_PERMISSION", human: "FUSE_HARNESS_SOUND_HUMAN" };

/**
 * Resolve the sound file for `kind`, or `null` when none is available. Cascade:
 * (1) the per-kind env override when present on disk; (2) the package's own
 * `assets/song/<f>.mp3`, located by walking up to the running `package.json`
 * ({@link runningVersion} — survives the flat/hashed `dist/` bundle a hardcoded
 * `../../` of non-deterministic depth would escape); (3) `$CLAUDE_PLUGIN_ROOT/song/<f>.mp3`. Never throws.
 * @param kind - Which event to voice.
 * @param env - Injectable environment (defaults to `process.env`).
 * @param moduleUrl - Injectable module URL (defaults to this module's; locates the package).
 */
export function resolveSound(kind: SoundKind, env: Record<string, string | undefined> = process.env, moduleUrl: string = import.meta.url): string | null {
  try {
    const override = env[ENV_VARS[kind]];
    if (override && existsSync(override)) return override;
    const pkgRoot = runningVersion(moduleUrl).path;
    if (pkgRoot !== "unknown") {
      const asset = join(pkgRoot, "assets", "song", FILES[kind]);
      if (existsSync(asset)) return asset;
    }
    const pluginRoot = env.CLAUDE_PLUGIN_ROOT;
    if (pluginRoot) {
      const fallback = join(pluginRoot, "song", FILES[kind]);
      if (existsSync(fallback)) return fallback;
    }
    return null;
  } catch {
    return null;
  }
}
