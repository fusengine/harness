/**
 * @module notifications
 * Native OS notification sound for lifecycle hook events (turn Stop, permission
 * needed, human needed). ON by default; opt OUT with `FUSE_HARNESS_SOUND=0`.
 *
 * Only two events invoke {@link notify}: the core-scope `Stop` (Codex-only —
 * Claude voices Stop via its own native `afplay` hook, so this never double-
 * sounds) and `TeammateIdle` (Claude-only, which has no native sound). That
 * structural split IS the anti-double-sound guarantee — do NOT add a harness-id
 * gate here: it would silence `TeammateIdle`'s "human" sound, whose only home is
 * claude-code. PermissionRequest/Notification stay native-only and are
 * intentionally not wired here (no dead code).
 *
 * ABSOLUTE fail-open, `command || true` semantics: an opt-out, an unsupported
 * platform, a missing player binary, a missing/undecodable sound file, or a
 * non-zero exit is swallowed — this module NEVER throws and NEVER blocks the
 * caller, so a broken/absent player can never break a hook.
 * @packageDocumentation
 */
import { spawn } from "node:child_process";
import { resolveSound, type SoundKind } from "./notification-sound";

export type { SoundKind } from "./notification-sound";

/** A resolved player invocation (binary + argv). */
export interface PlayerSpec {
  bin: string;
  args: string[];
}

/**
 * The player command for `platform` playing `file`, or undefined for an
 * unsupported platform. Pure — no filesystem/process access, so it is cheaply
 * unit-testable without spawning anything. mp3 decoding is native on darwin
 * (`afplay`); on linux (`paplay`/libsndfile) and win32 (`SoundPlayer`, wav-only)
 * a bare mp3 may not decode — harmless under the fail-open contract.
 * @param platform - `process.platform`-shaped value.
 * @param file - Absolute path to the sound file to play.
 */
export function resolvePlayer(platform: string, file: string): PlayerSpec | undefined {
  if (platform === "darwin") return { bin: "afplay", args: [file] };
  if (platform === "linux") return { bin: "paplay", args: [file] };
  if (platform === "win32") return { bin: "powershell", args: ["-NoProfile", "-c", `(New-Object Media.SoundPlayer '${file}').PlaySync()`] };
  return undefined;
}

/** True unless the user opted OUT (`FUSE_HARNESS_SOUND=0`). ON by default. */
export function soundEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FUSE_HARNESS_SOUND !== "0";
}

/**
 * Fire-and-forget a native notification sound for `kind`. See module doc for
 * the absolute fail-open contract. A `null` resolved sound (nothing on disk) is
 * a silent no-op.
 * @param kind - Which event to voice.
 * @param opts - Injectable platform/env/spawn for tests; production defaults to the real ones.
 */
export function notify(
  kind: SoundKind,
  opts: { platform?: string; env?: Record<string, string | undefined>; spawnFn?: typeof spawn } = {},
): void {
  try {
    const env = opts.env ?? process.env;
    if (!soundEnabled(env)) return;
    const file = resolveSound(kind, env);
    if (!file) return;
    const player = resolvePlayer(opts.platform ?? process.platform, file);
    if (!player) return;
    const run = opts.spawnFn ?? spawn;
    const child = run(player.bin, player.args, { stdio: "ignore", detached: true });
    child.on("error", () => { /* fail-open: a missing binary must never throw */ });
    child.unref();
  } catch {
    /* absolute fail-open: a notification must never break the hook */
  }
}
