/**
 * Hook stdin reading + debug tracing for `harness hook` — extracted from
 * `bin.ts` so the command dispatcher stays under the SOLID line ceiling.
 * Tracing is stderr-only and active only when FUSE_HARNESS_DEBUG=1 AND
 * CI=true (both set by test/sim/exec.ts; never in an interactive session).
 *
 * Stdin is read BOUNDED (`resolveStdinMaxBytes`, default 16 MiB): the reader
 * never buffers past the cap, so an oversized payload cannot exhaust memory
 * nor slip an uninspected tool call through (fail-closed — see `bin.ts`).
 */
import { readSync } from "node:fs";
import { resolveStdinMaxBytes } from "../config/limits";
import { respond } from "../runtime/respond";

const hookDebug = process.env.FUSE_HARNESS_DEBUG === "1" && process.env.CI === "true";

/** stderr-only trace, no-op outside the debug flag combination above. */
export function traceHook(label: string, data: unknown): void {
  if (hookDebug) process.stderr.write(`[hook-debug] ${label}: ${typeof data === "string" ? data : JSON.stringify(data)}\n`);
}

/** Result of the bounded stdin read. */
export type StdinRead =
  | { kind: "ok"; text: string }
  | { kind: "oversize"; head: string };

/** Type guard for the oversize variant (narrows the readStdin union). */
export function isOversize(x: unknown): x is { kind: "oversize"; head: string } {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "oversize";
}

/** First 4 KiB are kept on oversize for event-name sniffing downstream. */
const HEAD_BYTES = 4096;
const CHUNK = 64 * 1024;

/**
 * Read a file descriptor to EOF, bounded at `maxBytes` (+1 byte to detect
 * the overflow). Injectable fd so tests never touch process stdin.
 * @param fd - The descriptor to read (0 in production).
 * @param maxBytes - Cap from {@link resolveStdinMaxBytes}.
 */
export function readBounded(fd: number, maxBytes: number): StdinRead {
  const buf = Buffer.alloc(CHUNK);
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const n = readSync(fd, buf, 0, CHUNK, null);
    if (n === 0) break;
    total += n;
    // Copy the chunk: `buf` is reused by the next readSync, so a subarray VIEW
    // would be overwritten (multi-chunk head corruption — audit final).
    parts.push(Buffer.from(buf.subarray(0, n)));
    if (total > maxBytes) {
      return { kind: "oversize", head: Buffer.concat(parts).subarray(0, HEAD_BYTES).toString("utf8") };
    }
  }
  traceHook("stdin-text-length", total);
  return { kind: "ok", text: Buffer.concat(parts).toString("utf8") };
}

/** Read the hook payload from stdin; `{}` on empty or invalid JSON (fail-open parity). */
export async function readStdin(): Promise<Record<string, unknown> | StdinRead> {
  const cap = resolveStdinMaxBytes();
  const read = readBounded(0, cap);
  if (read.kind === "oversize") return read;
  const text = read.text.trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (e) { traceHook("stdin-parse-error", e instanceof Error ? e.message : String(e)); return {}; }
}

/** Blockable hook events (fail-closed on oversize); others are observation-only. */
const BLOCKABLE = new Set(["PreToolUse", "UserPromptSubmit", "Stop"]);

/**
 * Native stdout for an oversize payload: a deny on blockable (or
 * undeterminable) events — never an uninspected passthrough — and a neutral
 * empty string on observation-only events (no crash, no noise).
 * @param id - Harness id (selects the native deny shape via `respond`).
 * @param head - The first bytes of the payload (event-name sniffing).
 */
export function oversizeStdout(id: string, head: string): string {
  const event = /"hook_event_name"\s*:\s*"([^"]+)"/.exec(head)?.[1] ?? "";
  if (event && !BLOCKABLE.has(event)) return "";
  return respond(id, {
    kind: "block",
    title: "Oversize hook payload",
    reason: `stdin payload exceeds ${resolveStdinMaxBytes()} bytes — denied uninspected`,
  });
}
