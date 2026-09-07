/**
 * @module receipts
 * Verification receipts: capture a static-check or test run at PostToolUse and
 * query the freshest PASSING one for the TaskCompleted (hard) and SubagentStop
 * (advisory) gates. A "done" over modified code files is refused unless such a
 * receipt exists — mechanising "no proof, no done". Command recognition spans
 * many ecosystems (TS/JS, Python, Go, Rust, PHP, Swift, Dart) via the ordered
 * {@link RunnerSpec} table in `./receipt-runners`; which command text is even
 * eligible, and the structural "last segment" / output-suppression rules,
 * live in `./receipt-command`.
 *
 * Threat model (explicit): a receipt guards against FORGETTING to verify and
 * against honest shortcuts (a run whose output/exit code was accidentally
 * discarded, an informational invocation, a filtered run) — it is NOT a
 * security control against an agent that deliberately fabricates tool
 * output, same caveat as the `CONFIRM` code in the README.
 * @packageDocumentation
 */
import { withTrack, trackJournalEnabled } from "./store";
import { readTrackSync } from "./track-compact";
import { matchRunner, stripAnsi } from "./receipt-command";
import { unquotedShellText } from "../policy/guards/bash-write-unquoted";
import type { SessionTrack } from "./session-state";

/**
 * A verification receipt captured at PostToolUse from a Bash verification
 * command. Feeds the TaskCompleted receipt gate: a "done" over modified code
 * files is refused unless a fresh, passing receipt (`exitCode === 0`, `fail === 0`)
 * exists. `pass`/`fail` are parsed only for test runs; a static check (`kind:
 * "tsc"` — the literal is historical, it now means "static check": `tsc`,
 * `mypy`, `pyright`, `phpstan`, `go vet`/`build`, `cargo check`/`clippy`,
 * `swift build`) carries the exit code alone.
 */
export interface Receipt {
  kind: "tsc" | "test";
  /** The matched runner's tool name (`bun test`, `pytest`, `cargo test`, …). Absent on receipts predating this field — still verifiable via `kind`/`exitCode`/`fail` under the legacy branch of {@link isPassing}. */
  tool?: string;
  exitCode: number;
  pass?: number;
  fail?: number;
  ts: number;
}

/**
 * A single recognised verification command: which {@link RunnerSpec.kind} it
 * produces, its anchored command regex, and an optional pass/fail parser for
 * its output format.
 */
export interface RunnerSpec {
  tool: string;
  kind: "tsc" | "test";
  cmd: RegExp;
  counts?: (output: string) => { pass?: number; fail?: number };
}

/** Append a verification receipt to the track. Immutable. */
export function recordReceipt(track: SessionTrack, receipt: Receipt): SessionTrack {
  return { ...track, receipts: [...(track.receipts ?? []), receipt] };
}

/**
 * Classify a Bash command as a verification receipt via {@link matchRunner}
 * (`./receipt-command`: ordered `RUNNERS` table, first match wins, scoped to
 * the last shell list segment), or `null` when it resolves to none — a
 * zero-test/informational invocation, a runner sitting only in an EARLIER
 * list segment (`bun test && git commit`, `bun test || true`), or a runner
 * whose own segment suppresses its output after the match, none of which is
 * proof of anything. Runner regexes are tested against
 * `unquotedShellText(command)` (quote/heredoc/comment-stripped), never the
 * raw command, so a tool name mentioned inside a commit message, heredoc
 * body, or `echo`d string is never mistaken for a real invocation (H1).
 * `output` is ANSI/CR-stripped once ({@link stripAnsi}) before any
 * test-kind runner parses its pass/fail counts.
 * @param command - The Bash command line.
 * @param output - Combined stdout+stderr (bun writes its summary to stderr).
 * @param exitCode - The command's exit code.
 * @param now - Capture timestamp (epoch ms).
 */
export function classifyReceipt(command: string, output: string, exitCode: number, now: number): Receipt | null {
  const unquoted = unquotedShellText(command);
  const runner = matchRunner(unquoted);
  if (!runner) return null;
  const counts = runner.counts?.(stripAnsi(output)) ?? {};
  return { kind: runner.kind, tool: runner.tool, exitCode, pass: counts.pass, fail: counts.fail, ts: now };
}

/**
 * A receipt PROVES success only via POSITIVE evidence (D1: "no counts
 * observed" is no longer treated as proof): exit 0, plus — for `kind:
 * "test"`, a reported pass count strictly greater than 0 AND zero reported
 * failures (an unreported pass count proves nothing was ever executed); for
 * `kind: "tsc"` (static check), an EXPLICIT `fail === 0` (an undefined
 * `fail` — no success signature and no diagnostic count observed — proves
 * nothing either).
 *
 * Legacy compat: a receipt recorded before the `tool` field existed (`tool
 * === undefined`, the historical marker) keeps the PRE-fix contract so old
 * signed tracks are not retroactively invalidated: `test` kind passes on
 * `pass > 0 && fail === 0` (unchanged), `tsc` kind passes on `exitCode === 0`
 * alone (the old contract never inspected `fail` for a static check).
 */
function isPassing(r: Receipt): boolean {
  if (r.exitCode !== 0) return false;
  if (r.tool === undefined) {
    if (r.kind === "tsc") return true;
    return (r.pass ?? 0) > 0 && (r.fail ?? 0) === 0;
  }
  if (r.kind === "test") return r.pass !== undefined && r.pass > 0 && (r.fail ?? 0) === 0;
  return r.fail === 0;
}

/** The newest passing receipt within `windowMs`, or `null`. */
export function freshPassingReceipt(track: SessionTrack, windowMs: number, now: number): Receipt | null {
  const cutoff = now - windowMs;
  const hits = (track.receipts ?? []).filter((r) => r.ts > cutoff && isPassing(r));
  return hits.length ? hits.reduce((a, b) => (b.ts > a.ts ? b : a)) : null;
}

/**
 * Sync variant reading the track directly (snapshot ⊕ journal) — for the sync
 * gates (TaskCompleted / SubagentStop). Returns the newest passing receipt, or
 * `null` on any read/verify failure (fail-closed: no proof ⇒ unverified).
 */
export function freshReceiptFromFile(file: string, windowMs: number, now: number): Receipt | null {
  try {
    return freshPassingReceipt(readTrackSync(file, trackJournalEnabled()), windowMs, now);
  } catch {
    return null;
  }
}

/**
 * Capture a verification receipt from a PostToolUse Bash command into the signed
 * track (best effort — a non-verification command is a no-op).
 */
export async function captureReceipt(file: string, command: string, output: string, exitCode: number, now: number): Promise<void> {
  const receipt = classifyReceipt(command, output, exitCode, now);
  if (!receipt) return;
  await withTrack(file, (track) => recordReceipt(track, receipt));
}
