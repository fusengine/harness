/**
 * Hook stdin reading + debug tracing for `harness hook` — extracted from
 * `bin.ts` so the command dispatcher stays under the SOLID line ceiling.
 * Tracing is stderr-only and active only when FUSE_HARNESS_DEBUG=1 AND
 * CI=true (both set by test/sim/exec.ts; never in an interactive session).
 *
 * `resolveStdinMaxBytes` (default 16 MiB) caps retained payload content.
 * The legacy reader may also retain its overflow chunk; Cursor additionally
 * requests fixed scanner/chunk buffers while reading to EOF. Buffer alias views,
 * JS objects/strings, and RSS are runtime-dependent, so this is not a physical
 * memory guarantee. Unclassified oversized Cursor input fails closed.
 */
import { readSync } from "node:fs";
import { resolveStdinMaxBytes } from "../config/limits";
import { respond } from "../runtime/respond";
import { cursorEventContract } from "../adapters/cursor/events";
import { readCursorBounded } from "./cursor-stdin-reader";
export { cursorReaderBounds, readCursorBounded } from "./cursor-stdin-reader";

const hookDebug = process.env.FUSE_HARNESS_DEBUG === "1" && process.env.CI === "true";

/** stderr-only trace, no-op outside the debug flag combination above. */
export function traceHook(label: string, data: unknown): void {
  if (hookDebug) process.stderr.write(`[hook-debug] ${label}: ${typeof data === "string" ? data : JSON.stringify(data)}\n`);
}

/** Result of the bounded stdin read. */
export type StdinRead =
  | { kind: "ok"; text: string }
  | { kind: "oversize"; head: string };

const MALFORMED_STDIN: unique symbol = Symbol("cursor-malformed-stdin");
type MalformedStdin = { readonly [MALFORMED_STDIN]: true };

/** Type guard for the oversize variant (narrows the readStdin union). */
export function isOversize(x: unknown): x is { kind: "oversize"; head: string } {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "oversize";
}

/** Identify Cursor JSON parse failures without accepting a forgeable payload field. */
export function isMalformedCursorStdin(x: unknown): x is MalformedStdin {
  return typeof x === "object" && x !== null && MALFORMED_STDIN in x;
}

/** First 4 KiB are the fallback diagnostic probe when no event key is found. */
const HEAD_BYTES = 4096;
const CHUNK = 64 * 1024;
const CURSOR_MAX_STDIN_BYTES = 64 * 1024 * 1024;

/** Resolve and clamp Cursor's stdin cap while preserving other harness limits. */
export function resolveCursorStdinMaxBytes(env: Record<string, string | undefined> = process.env): number {
  return Math.min(CURSOR_MAX_STDIN_BYTES, resolveStdinMaxBytes(env));
}

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
    parts.push(Buffer.from(buf.subarray(0, n)));
    if (total > maxBytes) {
      return { kind: "oversize", head: Buffer.concat(parts).subarray(0, HEAD_BYTES).toString("utf8") };
    }
  }
  traceHook("stdin-text-length", total);
  return { kind: "ok", text: Buffer.concat(parts).toString("utf8") };
}

/** Read hook stdin; Cursor distinguishes malformed non-empty JSON from historical empty input. */
export async function readStdin(id?: string): Promise<Record<string, unknown> | StdinRead | MalformedStdin> {
  const cap = id === "cursor" ? resolveCursorStdinMaxBytes() : resolveStdinMaxBytes();
  const read = id === "cursor" ? readCursorBounded(0, cap) : readBounded(0, cap);
  if (read.kind === "oversize") return read;
  const text = read.text.trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (e) {
    traceHook("stdin-parse-error", e instanceof Error ? e.message : String(e));
    return id === "cursor" ? { [MALFORMED_STDIN]: true } : {};
  }
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
  const event = id === "cursor" ? probeEvent(head) : legacyProbeEvent(head);
  const maxBytes = id === "cursor" ? resolveCursorStdinMaxBytes() : resolveStdinMaxBytes();
  if (id === "cursor" && event) {
    const contract = cursorEventContract(event);
    if (!contract.known || !contract.blockable) return "{}";
  }
  if (id !== "cursor" && event && !BLOCKABLE.has(event)) return "";
  return respond(id, {
    kind: "block",
    title: "Oversize hook payload",
    reason: `stdin payload exceeds ${maxBytes} bytes — denied uninspected`,
  }, id === "cursor" ? (event || "preToolUse") : "PreToolUse");
}

function legacyProbeEvent(head: string): string {
  return /"hook_event_name"\s*:\s*"([^"]+)"/.exec(head)?.[1] ?? "";
}

function probeEvent(head: string): string {
  try {
    const parsed: unknown = JSON.parse(head);
    if (typeof parsed !== "object" || parsed === null) return "";
    const event = (parsed as Record<string, unknown>).hook_event_name;
    return typeof event === "string" ? event : "";
  } catch { return ""; }
}
