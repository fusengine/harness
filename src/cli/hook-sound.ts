/**
 * @module hook-sound
 * CLI short-circuit for `harness hook ... --sound <kind>` — play the embedded
 * notification sound and exit, bypassing stdin/handleHook entirely. Lets
 * plugin hooks.json entries call the harness directly instead of a native
 * `afplay`. Harness-agnostic by design: no gate on harness id here — codex,
 * cursor, and hermes hooks.json may call this flag exactly the same way.
 * @packageDocumentation
 */
import { notify, type SoundKind } from "../runtime/notifications";

/** Recognised sound kinds — anything else fails closed (returns `null`). */
const KINDS = new Set<SoundKind>(["stop", "permission", "human"]);

/**
 * Parse a `--sound <kind>` or `--sound=<kind>` flag anywhere in `argv`.
 * Returns the kind only when it is a recognised {@link SoundKind}; an absent
 * flag or an unrecognised value both yield `null` (fail-closed). Pure — no
 * side effects, so it is directly unit-testable.
 * @param argv - Full argv array (e.g. `process.argv`).
 */
export function soundArg(argv: string[]): SoundKind | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sound") {
      const val = argv[i + 1];
      return val !== undefined && KINDS.has(val as SoundKind) ? (val as SoundKind) : null;
    }
    if (arg !== undefined && arg.startsWith("--sound=")) {
      const val = arg.slice("--sound=".length);
      return KINDS.has(val as SoundKind) ? (val as SoundKind) : null;
    }
  }
  return null;
}

/**
 * Play the sound requested by a `--sound <kind>` flag in `argv`, if present
 * and valid. Fire-and-forget via {@link notify} (fail-open, respects
 * `FUSE_HARNESS_SOUND=0`). Returns whether a sound was triggered, so the
 * caller can short-circuit (exit 0) without ever reading stdin.
 * @param argv - Full argv array (e.g. `process.argv`).
 */
export function maybePlaySound(argv: string[]): boolean {
  const kind = soundArg(argv);
  if (!kind) return false;
  notify(kind);
  return true;
}
