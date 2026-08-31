import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LOCK_FAILED, withTrackLockSync } from "../../tracking/track-lock-sync";
import { atomicWrite } from "../../util/json-io";
import { sanitizeSessionId, sessionsDir } from "../home-state";
import { commandToString } from "../command-string";
import { displayCodeForAction, hashForAction } from "./confirm-code";
import { isSubagentActive } from "./confirm-subagent";
import type { CodexPromptOrigin } from "./codex-prompt-origin";

const TTL_MS = 5 * 60 * 1000;
const STATE_VERSION = 1;

type RejectReason = "no-token" | "mismatch" | "expired" | "already-consumed" | "missing-tool-use-id" | "state-io";
type Action = Readonly<{ hash: string; code: string; command: string; ts: number }>;
type Receipt = Action & Readonly<{ toolUseId: string }>;
type CodexState = Readonly<{ codexConfirmPending?: Action; codexConfirmToken?: Action; codexConfirmReceipt?: Receipt }>;

function statePath(sid: string, home: string): string {
  return join(sessionsDir(home), `codex-confirm-${sid}.json`);
}

function lockDir(sid: string, home: string): string {
  return join(sessionsDir(home), ".confirm-locks", sid);
}

function loadState(sid: string, home: string): CodexState {
  const path = statePath(sid, home);
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as CodexState : {};
}

function saveState(sid: string, state: CodexState, home: string): void {
  mkdirSync(sessionsDir(home), { recursive: true, mode: 0o700 });
  atomicWrite(statePath(sid, home), JSON.stringify(state, null, 2));
}

/** Canonical identity of one Codex shell action and its display token. */
export function codexAction(tool: string, cwd: string, command: unknown, now: number): Action | null {
  const canonicalCommand = commandToString(command);
  if (!canonicalCommand) return null;
  const identity = JSON.stringify({ version: STATE_VERSION, harness: "codex", tool, cwd: resolve(cwd), command: canonicalCommand });
  return { hash: hashForAction(identity), code: displayCodeForAction(identity), command: canonicalCommand, ts: now };
}

/** Atomically authorize or reject a Codex action, recording the current denial when needed. */
export function authorizeCodexAction(
  sessionIdRaw: unknown,
  action: Action,
  toolUseId: string | undefined,
  now: number,
  home: string = homedir(),
): { allow: true } | { allow: false; reason: RejectReason } {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return { allow: false, reason: "state-io" };
  try {
    const result = withTrackLockSync(lockDir(sid, home), () => {
      const state = loadState(sid, home);
      const token = state.codexConfirmToken;
      const receipt = state.codexConfirmReceipt;
      const receiptExpired = receipt !== undefined && now - receipt.ts > TTL_MS;
      if (!receiptExpired && receipt?.hash === action.hash && receipt.toolUseId === toolUseId && toolUseId) return { allow: true } as const;

      let reason: RejectReason = "no-token";
      if (token) {
        if (token.hash !== action.hash) reason = "mismatch";
        else if (now - token.ts > TTL_MS) reason = "expired";
        else if (!toolUseId) reason = "missing-tool-use-id";
        else {
          const { codexConfirmToken: _token, codexConfirmPending: _pending, ...rest } = state;
          saveState(sid, { ...rest, codexConfirmReceipt: { ...action, toolUseId } satisfies Receipt }, home);
          return { allow: true } as const;
        }
      } else if (receipt?.hash === action.hash) reason = receiptExpired ? "expired" : "already-consumed";

      if (reason === "missing-tool-use-id") return { allow: false, reason } as const;
      const pending = state.codexConfirmPending;
      const stablePending = pending?.hash === action.hash ? pending : action;
      const { codexConfirmToken: _token, codexConfirmReceipt: _receipt, ...withoutReceipt } = state;
      const rest = receiptExpired ? withoutReceipt : { ...withoutReceipt, codexConfirmReceipt: receipt };
      saveState(sid, { ...rest, codexConfirmPending: stablePending }, home);
      return { allow: false, reason } as const;
    });
    return result === LOCK_FAILED ? { allow: false, reason: "state-io" } : result;
  } catch {
    return { allow: false, reason: "state-io" };
  }
}

/**
 * Atomically arm the last Codex denial, consuming its pending record exactly once.
 * A classified root prompt may bypass G0; classified subagent/unknown prompts fail closed.
 */
export function submitCodexConfirmation(
  sessionIdRaw: unknown,
  text: string,
  now: number,
  home: string = homedir(),
  origin?: CodexPromptOrigin,
): void {
  const sid = sanitizeSessionId(sessionIdRaw);
  if (!sid) return;
  const refusal = /\b(non|no|stop|annule|cancel|abort|nope|laisse tomber|pas maintenant)\b/i.test(text);
  const typedCode = text.trim().match(/^confirm[ _-]*([0-9a-f]{4})$/i)?.[1];
  try {
    withTrackLockSync(lockDir(sid, home), () => {
      const state = loadState(sid, home);
      if (origin !== undefined && origin !== "root") return;
      if (refusal) {
        const { codexConfirmPending: _pending, codexConfirmToken: _token, ...rest } = state;
        saveState(sid, rest, home);
        return;
      }
      if (!typedCode) return;
      if (origin === undefined && isSubagentActive(sid, now, home)) return;
      const pending = state.codexConfirmPending;
      if (!pending || pending.code.toLowerCase() !== typedCode.toLowerCase()) return;
      const { codexConfirmPending: _pending, ...rest } = state;
      saveState(sid, { ...rest, codexConfirmToken: { ...pending, ts: now } }, home);
    });
  } catch {
    // Submission is advisory state wiring; hook execution must remain available.
  }
}
