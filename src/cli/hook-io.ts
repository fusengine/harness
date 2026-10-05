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
 *
 * The raw bounded read lives in `stdin-text.ts` (light: no runtime imports) and
 * is re-exported here unchanged.
 */
import { respond } from "../runtime/respond";
import { cursorEventContract } from "../adapters/cursor/events";
import { readStdinRead, resolveCursorStdinMaxBytes, traceHook, type StdinRead } from "./stdin-text";
import { resolveStdinMaxBytes } from "../config/limits";
export { cursorReaderBounds, readCursorBounded } from "./cursor-stdin-reader";
export { readBounded, resolveCursorStdinMaxBytes, traceHook, type StdinRead } from "./stdin-text";

const MALFORMED_STDIN: unique symbol = Symbol("cursor-malformed-stdin");
type MalformedStdin = { readonly [MALFORMED_STDIN]: true };

/** Type guard for the oversize variant (narrows the readStdin union). */
export function isOversize(x: unknown): x is { kind: "oversize"; head: string; stalled?: boolean } {
  return typeof x === "object" && x !== null && (x as { kind?: unknown }).kind === "oversize";
}

/** Identify Cursor JSON parse failures without accepting a forgeable payload field. */
export function isMalformedCursorStdin(x: unknown): x is MalformedStdin {
  return typeof x === "object" && x !== null && MALFORMED_STDIN in x;
}

/**
 * Turn an already-read {@link StdinRead} into what {@link readStdin} returns:
 * the oversize marker, an empty object, the parsed payload, or (Cursor only)
 * the malformed marker.
 * @param id - Harness id (Cursor distinguishes malformed JSON from empty input).
 * @param read - The bounded read result.
 */
export function parseStdinRead(id: string | undefined, read: StdinRead): Record<string, unknown> | StdinRead | MalformedStdin {
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

/** Read hook stdin; Cursor distinguishes malformed non-empty JSON from historical empty input. */
export async function readStdin(id?: string): Promise<Record<string, unknown> | StdinRead | MalformedStdin> {
  return parseStdinRead(id, await readStdinRead(id));
}

/** Blockable hook events (fail-closed on oversize); others are observation-only. */
const BLOCKABLE = new Set(["PreToolUse", "UserPromptSubmit", "Stop"]);

/**
 * Native stdout for an oversize payload: a deny on blockable (or
 * undeterminable) events — never an uninspected passthrough — and a neutral
 * empty string on observation-only events (no crash, no noise).
 * @param id - Harness id (selects the native deny shape via `respond`).
 * @param head - The first bytes of the payload (event-name sniffing).
 * @param stalled - The payload never completed (partial bound expired) rather than exceeding the cap.
 */
export function oversizeStdout(id: string, head: string, stalled = false): string {
  const event = id === "cursor" ? (probeEvent(head) || (stalled ? legacyProbeEvent(head) : "")) : legacyProbeEvent(head);
  const maxBytes = id === "cursor" ? resolveCursorStdinMaxBytes() : resolveStdinMaxBytes();
  if (id === "cursor" && event) {
    const contract = cursorEventContract(event);
    if (!contract.known || !contract.blockable) return "{}";
  }
  if (id !== "cursor" && event && !BLOCKABLE.has(event)) return "";
  return respond(id, {
    kind: "block",
    title: stalled ? "Incomplete hook payload" : "Oversize hook payload",
    reason: stalled
      ? "stdin payload never completed within the partial-payload bound — denied uninspected"
      : `stdin payload exceeds ${maxBytes} bytes — denied uninspected`,
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
