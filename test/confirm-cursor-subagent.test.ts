/**
 * Cursor runs a sub-agent under its OWN conversation_id while the human types
 * `CONFIRM <code>` in the PARENT chat. Measured chain (Cursor 3.23 hook logs):
 * parent `subagentStart` { conversation_id: P, tool_call_id: X } precedes every
 * sub-agent payload { conversation_id: C, parent_tool_call_id: X }. Without the
 * link, the sub-agent's denied command could never be confirmed (endless loop).
 */
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { cursorParentSessionId, recordCursorSubagentLink } from "../src/runtime/confirm/cursor-subagent-link";
import { confirmGate } from "../src/runtime/confirm/confirm-gate";
import { placeConfirmToken } from "../src/runtime/confirm/confirm-state";
import { getPendingDeny } from "../src/runtime/confirm/confirm-pending";
import { hashForAction } from "../src/runtime/confirm/confirm-code";
import type { Prompt } from "../src/prompt/types";

const home = (): string => mkdtempSync(join(tmpdir(), "fh-ccsa-home-"));
const NOW = 1_800_000_000_000;
const ASK: Prompt = { kind: "ask", title: "Confirm git operation", reason: "git add needs confirmation", actions: [] };
const CMD = "git add src/a.ts";

test("link: recorded at subagentStart, resolved from the child's parent_tool_call_id; absent/self/unknown → undefined", () => {
  const h = home(), P = `p-${randomUUID()}`, X = `toolu_${randomUUID().replaceAll("-", "")}`;
  recordCursorSubagentLink({ conversation_id: P, session_id: P, parent_conversation_id: P, tool_call_id: X, subagent_id: X }, h);
  expect(cursorParentSessionId({ session_id: "child-1", parent_tool_call_id: X }, h)).toBe(P);
  expect(cursorParentSessionId({ session_id: "child-1" }, h)).toBeUndefined(); // top-level payload
  expect(cursorParentSessionId({ session_id: P, parent_tool_call_id: X }, h)).toBeUndefined(); // never itself
  expect(cursorParentSessionId({ session_id: "child-1", parent_tool_call_id: "toolu_unknown" }, h)).toBeUndefined();
  expect(cursorParentSessionId({ session_id: "child-1", parent_tool_call_id: "../etc" }, h)).toBeUndefined();
});

test("confirmGate (cursor sub-agent): deny mirrors the pending code on the parent; the parent's token is consumed by the child (+ one sibling pass)", () => {
  const h = home(), P = `p-${randomUUID()}`, C = `c-${randomUUID()}`;
  const denied = confirmGate("cursor", ASK, CMD, C, NOW, h, undefined, "g1", P);
  expect(denied?.allow).toBe(false);
  expect(getPendingDeny(P, h)?.hash).toBe(hashForAction(CMD)); // the human's CONFIRM in the parent chat matches
  expect(getPendingDeny(C, h)?.hash).toBe(hashForAction(CMD));
  placeConfirmToken(P, hashForAction(CMD), NOW + 1000, h, {});
  expect(confirmGate("cursor", ASK, CMD, C, NOW + 2000, h, undefined, "g2", P)?.allow).toBe(true); // preToolUse
  expect(confirmGate("cursor", ASK, CMD, C, NOW + 2100, h, undefined, "g2", P)?.allow).toBe(true); // beforeShellExecution
  expect(confirmGate("cursor", ASK, CMD, C, NOW + 2200, h, undefined, "g3", P)?.allow).toBe(false); // spent
});

test("non-cursor: a parent session argument is ignored (Kimi stays strictly per-session)", () => {
  const h = home(), P = `p-${randomUUID()}`, C = `c-${randomUUID()}`;
  placeConfirmToken(P, hashForAction(CMD), NOW, h, {});
  expect(confirmGate("kimi", ASK, CMD, C, NOW + 100, h, undefined, undefined, P)?.allow).toBe(false);
  expect(getPendingDeny(P, h)).toBeUndefined();
});

/** The measured Cursor sequence through the real CLI (isolated HOME, DEFAULT G0 window, real `call-…\nfc_…` id format). */
function scenario(withLink: boolean, childSubmits = false): { first: string; afterConfirm: string; afterSibling: string } {
  const h = home(), cwd = mkdtempSync(join(tmpdir(), "fh-ccsa-cwd-"));
  const P = randomUUID(), C = randomUUID(), X = `call-${randomUUID()}\nfc_${randomUUID()}_0`;
  const bin = join(import.meta.dir, "..", "src", "cli", "bin.ts");
  const env = { PATH: process.env.PATH ?? "", HOME: h };
  const run = (p: Record<string, unknown>): string =>
    Bun.spawnSync(["bun", bin, "hook", "cursor", "core"], { cwd, env, stdin: Buffer.from(JSON.stringify(p)), timeout: 30_000 }).stdout.toString();
  const ids = (s: string) => ({ conversation_id: s, session_id: s, workspace_roots: [cwd], cwd });
  const link = withLink ? { parent_tool_call_id: X } : {};
  run({ ...ids(P), generation_id: P, hook_event_name: "subagentStart", subagent_id: X, tool_call_id: X, parent_conversation_id: P, subagent_type: "general-purpose", task: "stage" });
  const pre = (g: string) => ({ ...ids(C), ...link, generation_id: g, hook_event_name: "preToolUse", tool_name: "Shell", tool_use_id: randomUUID(), tool_input: { command: CMD } });
  const first = run(pre(randomUUID()));
  const code = first.match(/CONFIRM ([0-9a-f]{4})/i)?.[1];
  // The human types the code in the parent chat right away — no G0 wait on Cursor's parent chat.
  const submitter = childSubmits ? { ...ids(C), parent_tool_call_id: X } : ids(P);
  run({ ...submitter, generation_id: randomUUID(), hook_event_name: "beforeSubmitPrompt", prompt: `CONFIRM ${code}` });
  const g = randomUUID();
  const afterConfirm = run(pre(g));
  const afterSibling = run({ ...ids(C), ...link, generation_id: g, hook_event_name: "beforeShellExecution", command: CMD });
  return { first, afterConfirm, afterSibling };
}

test("end to end (real CLI): the sub-agent's git add passes after CONFIRM typed in the parent chat", () => {
  const r = scenario(true);
  expect(JSON.parse(r.first).permission).toBe("deny");
  expect(r.afterConfirm).not.toContain('"deny"');
  expect(r.afterSibling).not.toContain('"deny"');
}, 60_000);

test("G0 on Cursor: a prompt from the sub-agent's own conversation never arms a CONFIRM", () => {
  expect(JSON.parse(scenario(true, true).afterConfirm).permission).toBe("deny");
}, 60_000);

test("negative witness: without the parent_tool_call_id link, the former loop remains (still denied)", () => {
  const r = scenario(false);
  expect(JSON.parse(r.afterConfirm).permission).toBe("deny");
}, 60_000);
