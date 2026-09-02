import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook, type HandleOptions } from "../src/runtime/handle";
import { markSubagentSeen } from "../src/runtime/confirm/confirm-subagent";

const temp = (label: string): string => mkdtempSync(join(tmpdir(), `fh-${label}-`));

function pre(sessionId: string, command: string, toolUseId: string) {
  return {
    hook_event_name: "PreToolUse",
    session_id: sessionId,
    tool_use_id: toolUseId,
    tool_name: "Bash",
    tool_input: { command },
  };
}

function codeFrom(stdout: string): string {
  const code = stdout.match(/CONFIRM ([0-9a-f]{4})/i)?.[1];
  if (!code) throw new Error(`missing CONFIRM code: ${stdout}`);
  return code;
}

test("root Codex UserPromptSubmit arms the exact pending action during recent subagent cooldown", async () => {
  const home = temp("confirm-provenance-home");
  const cwd = temp("confirm-provenance-cwd");
  const sessionId = `root-${randomUUID()}`;
  const command = "git commit -m live-root-confirm";
  const opts: HandleOptions = { now: 1000, cwd, home };
  const denied = await handleHook("codex", pre(sessionId, command, "tool-a"), opts);
  const code = codeFrom(denied.stdout);

  markSubagentSeen(sessionId, 1050, home);
  await handleHook("codex", {
    hook_event_name: "UserPromptSubmit",
    session_id: sessionId,
    prompt: `CONFIRM ${code}\n`,
  }, { ...opts, now: 1100 });

  const allowed = await handleHook("codex", pre(sessionId, command, "tool-a"), { ...opts, now: 1200 });
  expect(allowed.stdout).not.toContain('"permissionDecision":"deny"');
});

async function remainsDeniedAfterSubmit(agentFields: Record<string, unknown>): Promise<boolean> {
  const home = temp("confirm-provenance-home");
  const cwd = temp("confirm-provenance-cwd");
  const sessionId = `closed-${randomUUID()}`;
  const command = "git commit -m provenance-closed";
  const opts: HandleOptions = { now: 1000, cwd, home };
  const denied = await handleHook("codex", pre(sessionId, command, "tool-a"), opts);
  const code = codeFrom(denied.stdout);
  await handleHook("codex", {
    hook_event_name: "UserPromptSubmit",
    session_id: sessionId,
    prompt: `CONFIRM ${code}\n`,
    ...agentFields,
  }, { ...opts, now: 1100 });
  const retried = await handleHook("codex", pre(sessionId, command, "tool-a"), { ...opts, now: 1200 });
  return retried.stdout.includes('"permissionDecision":"deny"');
}

test("explicit Codex agent provenance cannot arm a root pending action", async () => {
  expect(await remainsDeniedAfterSubmit({ agent_id: "agent-1", agent_type: "worker" })).toBe(true);
  expect(await remainsDeniedAfterSubmit({ agent_id: "agent-1" })).toBe(true);
  expect(await remainsDeniedAfterSubmit({ agent_type: "worker" })).toBe(true);
});

test("malformed Codex agent provenance fails closed", async () => {
  for (const fields of [
    { agent_id: null },
    { agent_type: "" },
    { agent_id: 42 },
    { agent_id: "agent-1", agent_type: null },
  ]) {
    expect(await remainsDeniedAfterSubmit(fields)).toBe(true);
  }
});

test("non-root Codex refusal cannot consume or clear the pending root action", async () => {
  for (const agentFields of [{ agent_id: "agent-1" }, { agent_id: null }]) {
    const home = temp("confirm-refusal-home");
    const cwd = temp("confirm-refusal-cwd");
    const sessionId = `refusal-${randomUUID()}`;
    const command = "git commit -m refusal-provenance";
    const opts: HandleOptions = { now: 1000, cwd, home };
    const denied = await handleHook("codex", pre(sessionId, command, "tool-a"), opts);
    const code = codeFrom(denied.stdout);
    await handleHook("codex", {
      hook_event_name: "UserPromptSubmit", session_id: sessionId, prompt: "cancel", ...agentFields,
    }, { ...opts, now: 1050 });
    await handleHook("codex", {
      hook_event_name: "UserPromptSubmit", session_id: sessionId, prompt: `CONFIRM ${code}\n`,
    }, { ...opts, now: 1100 });
    const allowed = await handleHook("codex", pre(sessionId, command, "tool-a"), { ...opts, now: 1200 });
    expect(allowed.stdout).not.toContain('"permissionDecision":"deny"');
  }
});

test("root Codex confirmation rejects wrong, multiline, and incidental tokens", async () => {
  for (const promptFor of [
    (_code: string) => "CONFIRM dead\n",
    (code: string) => `notes before\nCONFIRM ${code}\n`,
    (code: string) => `please CONFIRM ${code} now\n`,
  ]) {
    const home = temp("confirm-prompt-home");
    const cwd = temp("confirm-prompt-cwd");
    const sessionId = `prompt-${randomUUID()}`;
    const command = "git commit -m prompt-shape";
    const opts: HandleOptions = { now: 1000, cwd, home };
    const denied = await handleHook("codex", pre(sessionId, command, "tool-a"), opts);
    await handleHook("codex", {
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      prompt: promptFor(codeFrom(denied.stdout)),
    }, { ...opts, now: 1100 });
    const retried = await handleHook("codex", pre(sessionId, command, "tool-a"), { ...opts, now: 1200 });
    expect(retried.stdout).toContain('"permissionDecision":"deny"');
  }
});

test("agent metadata remains irrelevant to non-Codex UserPromptSubmit handling", async () => {
  for (const id of ["claude-code", "kimi", "cursor"]) {
    const opts: HandleOptions = { now: 1000, cwd: temp("confirm-cross-cwd"), home: temp("confirm-cross-home") };
    const event = "UserPromptSubmit";
    // Nonces strip a-f so no DEV_VERBS alternative (e.g. "add") can appear
    // inside the hex UUID by chance (DEV_VERBS has no \b word boundary — see
    // src/policy/claude-md-context.ts). Kept distinct (root vs attributed)
    // so inject-dedup's 3s window does not collapse them into one prompt.
    const rootNonce = randomUUID().replace(/[a-f]/g, "");
    const attributedNonce = `${randomUUID().replace(/[a-f]/g, "")}-1`;
    const root = await handleHook(id, {
      hook_event_name: event,
      session_id: `cross-root-${randomUUID()}`,
      prompt: `ordinary root prompt ${rootNonce}`,
    }, opts);
    const attributed = await handleHook(id, {
      hook_event_name: event,
      session_id: `cross-agent-${randomUUID()}`,
      prompt: `ordinary attributed prompt ${attributedNonce}`,
      agent_id: "agent-1",
      agent_type: "worker",
    }, opts);
    expect(attributed).toEqual(root);
  }
});
