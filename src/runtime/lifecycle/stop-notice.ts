/**
 * @module stop-notice
 * Stop-hook delivery for the session SOLID / receipt checks. Stop fires at the
 * end of EVERY turn and the checks re-read the session's whole modified-file
 * list, so the same verdict would repeat every turn — and on Claude Code a Stop
 * `additionalContext` re-opens the turn (up to 8 times), which looped agents on
 * an unchanged, often pre-existing oversized file. A SOLID verdict is emitted
 * ONCE per session and re-emitted only when its content changes (e.g. a file's
 * line count moves). The receipt refusal follows the lessons (memory) reminder
 * cadence instead: repeated every {@link throttleMs} while no fresh passing
 * receipt exists, never on consecutive turns inside that window. Each uses its
 * OWN dedup sidecar: `oncePerWindow` prunes the shared one with the caller's
 * window, so a 3 s caller (per-prompt context inject) would erase these keys.
 * TaskCompleted never goes through here.
 * @packageDocumentation
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { contextResponse } from "../../adapters/claude";
import { oncePerWindow } from "../inject-dedup";
import { throttleMs } from "../../memory/state";

/** Dedup horizon for a Stop verdict: longer than any working session. */
const STOP_ONCE_MS = 24 * 60 * 60 * 1000;

/**
 * True the first time this exact `content` is seen for session `sid` (the caller emits);
 * false on every identical repeat (the caller stays silent).
 * @param sid - Sanitized session id.
 * @param content - The full verdict text (any change re-arms the notice).
 * @param stateDir - Project state dir holding the dedup sidecar.
 * @param now - Clock.
 * @returns Whether to emit.
 */
export function stopNoticeOnce(sid: string, content: string, stateDir: string, now: number): boolean {
  const digest = createHash("sha1").update(content).digest("hex").slice(0, 16);
  return oncePerWindow(`stop-notice:${sid}:${digest}`, STOP_ONCE_MS, { now, dir: join(stateDir, "stop-notice") });
}

/**
 * Receipt-refusal cadence on Stop, same as the lessons (memory) Stop reminder:
 * true at most once per {@link throttleMs} window (`FUSE_LESSONS_THROTTLE_MIN`,
 * default 5 min) per session, so an unverified session is reminded periodically,
 * never on every turn.
 * @param sid - Sanitized session id.
 * @param stateDir - Project state dir (holds the dedicated receipt sidecar).
 * @param now - Clock.
 * @returns Whether to emit.
 */
export function stopReceiptDue(sid: string, stateDir: string, now: number): boolean {
  return oncePerWindow(`stop-receipt:${sid}`, throttleMs(), { now, dir: join(stateDir, "stop-receipt") });
}

/**
 * Actionable Stop text for oversized files: what exceeds the ceiling and what the agent must do.
 * @param violations - `<basename>: <n> lines (max <max>)` entries.
 * @param max - The SOLID line ceiling.
 * @returns The message.
 */
export function stopSolidMessage(violations: readonly string[], max: number): string {
  return (
    `SOLID VIOLATION: ${violations.length} file(s) exceed ${max} lines: ${violations.slice(0, 5).join("; ")}. ` +
    `Action: split each into modules under ${max} lines before reporting done. ` +
    `If a file was already over ${max} lines before your change and splitting is outside your task, tell the owner instead of splitting. ` +
    "(Shown once per session; repeats only if a file's size changes.)"
  );
}

/**
 * Harness-native Stop payload carrying `msg` to the agent: Codex's Stop schema
 * (deny_unknown_fields) rejects `hookSpecificOutput`, so it gets `decision:"block"` + `reason`;
 * every other harness keeps the `additionalContext` response.
 * @param id - Harness adapter id.
 * @param msg - The message.
 * @returns The native hook stdout.
 */
export function stopSolidResponse(id: string, msg: string): string {
  return id === "codex" ? JSON.stringify({ decision: "block", reason: msg }) : contextResponse("Stop", msg);
}
