/**
 * @module receipts
 * Verification receipts: capture `tsc`/test runs at PostToolUse and query the
 * freshest PASSING one for the TaskCompleted (hard) and SubagentStop (advisory)
 * gates. A "done" over modified code files is refused unless such a receipt
 * exists — mechanising "no proof, no done".
 * @packageDocumentation
 */
import { existsSync, readFileSync } from "node:fs";
import { withTrack } from "./store";
import { verifyTrack, type TrackEnvelope } from "./integrity";
import type { SessionTrack } from "./session-state";

/**
 * A verification receipt captured at PostToolUse from a Bash verification
 * command. Feeds the TaskCompleted receipt gate: a "done" over modified code
 * files is refused unless a fresh, passing receipt (`exitCode === 0`, `fail === 0`)
 * exists. `pass`/`fail` are parsed only for test runs; `tsc` carries the code alone.
 */
export interface Receipt {
  kind: "tsc" | "test";
  exitCode: number;
  pass?: number;
  fail?: number;
  ts: number;
}

/** `tsc` / `bunx tsc` / `npx tsc -p .` — a type-check invocation. */
const TSC_RE = /(?:^|\s|\/)(?:bunx\s+|npx\s+|pnpm\s+|yarn\s+)?tsc\b/;
/** `bun test`, `vitest`, `jest`, `npm test`, `npm run test`, … — a test run. */
const TEST_RE = /\b(?:bun\s+test|vitest|jest|(?:npm|pnpm|yarn)\s+(?:run\s+)?test)\b/;

/** Append a verification receipt to the track. Immutable. */
export function recordReceipt(track: SessionTrack, receipt: Receipt): SessionTrack {
  return { ...track, receipts: [...(track.receipts ?? []), receipt] };
}

/** Parse `N pass` / `M fail` counts from bun/vitest/jest output (undefined when absent). */
function parseCounts(output: string): { pass?: number; fail?: number } {
  const pass = output.match(/(\d+)\s+pass/i);
  const fail = output.match(/(\d+)\s+fail/i);
  return { pass: pass ? Number(pass[1]) : undefined, fail: fail ? Number(fail[1]) : undefined };
}

/**
 * Classify a Bash command as a verification receipt, or `null` when it is not a
 * recognised `tsc`/test invocation. Test runs additionally carry parsed
 * pass/fail counts.
 * @param command - The Bash command line.
 * @param output - Combined stdout+stderr (bun writes its summary to stderr).
 * @param exitCode - The command's exit code.
 * @param now - Capture timestamp (epoch ms).
 */
export function classifyReceipt(command: string, output: string, exitCode: number, now: number): Receipt | null {
  if (TEST_RE.test(command)) {
    const { pass, fail } = parseCounts(output);
    return { kind: "test", exitCode, pass, fail, ts: now };
  }
  if (TSC_RE.test(command)) return { kind: "tsc", exitCode, ts: now };
  return null;
}

/** A receipt PROVES success: exit 0 and (for tests) zero reported failures. */
function isPassing(r: Receipt): boolean {
  return r.exitCode === 0 && (r.fail ?? 0) === 0;
}

/** The newest passing receipt within `windowMs`, or `null`. */
export function freshPassingReceipt(track: SessionTrack, windowMs: number, now: number): Receipt | null {
  const cutoff = now - windowMs;
  const hits = (track.receipts ?? []).filter((r) => r.ts > cutoff && isPassing(r));
  return hits.length ? hits.reduce((a, b) => (b.ts > a.ts ? b : a)) : null;
}

/**
 * Sync variant reading the signed track file directly — for the sync gates
 * (TaskCompleted / SubagentStop). Returns the newest passing receipt, or `null`
 * on any read/verify failure (fail-closed: no proof ⇒ treated as unverified).
 */
export function freshReceiptFromFile(file: string, windowMs: number, now: number): Receipt | null {
  try {
    if (!existsSync(file)) return null;
    const env = JSON.parse(readFileSync(file, "utf-8")) as TrackEnvelope;
    const track = verifyTrack(env);
    return track ? freshPassingReceipt(track, windowMs, now) : null;
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
