/**
 * Codex CONFIRM state file (`codex-confirm-<sid>.json`) — multi-entry format v2:
 * several pending denials, armed tokens, and consumption receipts per session.
 * The v1 single-slot keys (`codexConfirmPending`/`codexConfirmToken`/
 * `codexConfirmReceipt`) are still READ and merged into the arrays on load
 * (backward compatibility); writes always emit the v2 shape only.
 */
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "../../util/json-io";
import { sessionsDir } from "../home-state";

/** Canonical identity of one Codex shell action and its display token. */
export type CodexAction = Readonly<{ hash: string; code: string; command: string; ts: number }>;
/** A consumed confirmation: proves ONE tool_use_id of the action was allowed. */
export type CodexReceipt = CodexAction & Readonly<{ toolUseId: string }>;

/** The three multi-entry lists of a session, newest LAST (eviction drops the head). */
export interface CodexConfirmBuckets {
  pending: CodexAction[];
  tokens: CodexAction[];
  receipts: CodexReceipt[];
}

/** Cap per list — a new denial never erases the other entries, the oldest is evicted beyond this. */
export const MAX_CODEX_CONFIRM_ENTRIES = 10;

/** Legacy v1 single-slot keys, still honored on read. */
type CodexStateFile = Readonly<{
  version?: number;
  pending?: CodexAction[];
  tokens?: CodexAction[];
  receipts?: CodexReceipt[];
  codexConfirmPending?: CodexAction;
  codexConfirmToken?: CodexAction;
  codexConfirmReceipt?: CodexReceipt;
}>;

/** Absolute path of this session's Codex CONFIRM state file. */
export function codexConfirmStatePath(sid: string, home: string = homedir()): string {
  return join(sessionsDir(home), `codex-confirm-${sid}.json`);
}

/** Absolute path of this session's cross-process lock dir (track-lock-sync). */
export function codexConfirmLockDir(sid: string, home: string = homedir()): string {
  return join(sessionsDir(home), ".confirm-locks", sid);
}

function isAction(v: unknown): v is CodexAction {
  const o = v as CodexAction;
  return typeof o === "object" && o !== null && typeof o.hash === "string" && typeof o.code === "string" && typeof o.command === "string" && typeof o.ts === "number";
}

function isReceipt(v: unknown): v is CodexReceipt {
  return isAction(v) && typeof (v as CodexReceipt).toolUseId === "string";
}

/**
 * Load the session's buckets, merging any legacy v1 single-slot keys into the
 * arrays. Unknown/corrupt content degrades to empty buckets (never throws on
 * shape — JSON.parse errors still propagate to the caller's try/catch).
 */
export function loadCodexConfirmState(sid: string, home: string = homedir()): CodexConfirmBuckets {
  const path = codexConfirmStatePath(sid, home);
  if (!existsSync(path)) return { pending: [], tokens: [], receipts: [] };
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { pending: [], tokens: [], receipts: [] };
  const raw = parsed as CodexStateFile;
  const pending = Array.isArray(raw.pending) ? raw.pending.filter(isAction) : [];
  const tokens = Array.isArray(raw.tokens) ? raw.tokens.filter(isAction) : [];
  const receipts = Array.isArray(raw.receipts) ? raw.receipts.filter(isReceipt) : [];
  if (raw.codexConfirmPending && isAction(raw.codexConfirmPending)) pending.push(raw.codexConfirmPending);
  if (raw.codexConfirmToken && isAction(raw.codexConfirmToken)) tokens.push(raw.codexConfirmToken);
  if (raw.codexConfirmReceipt && isReceipt(raw.codexConfirmReceipt)) receipts.push(raw.codexConfirmReceipt);
  return { pending, tokens, receipts };
}

/** Persist the buckets in v2 shape (legacy keys are dropped), capped per list. */
export function saveCodexConfirmState(sid: string, buckets: CodexConfirmBuckets, home: string = homedir()): void {
  mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
  const state = {
    version: 2,
    pending: buckets.pending.slice(-MAX_CODEX_CONFIRM_ENTRIES),
    tokens: buckets.tokens.slice(-MAX_CODEX_CONFIRM_ENTRIES),
    receipts: buckets.receipts.slice(-MAX_CODEX_CONFIRM_ENTRIES),
  };
  atomicWrite(codexConfirmStatePath(sid, home), JSON.stringify(state, null, 2));
}

/** Append-or-refresh `action` in a newest-last list (same hash = one entry), capped. */
export function upsertCodexEntry<T extends CodexAction>(list: readonly T[], action: T): T[] {
  return [...list.filter((p) => p.hash !== action.hash), action].slice(-MAX_CODEX_CONFIRM_ENTRIES);
}
