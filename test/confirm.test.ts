import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handleHook, type HandleOptions } from "../src/runtime/handle";
import { isIrreversible } from "../src/runtime/confirm/confirm-irreversible";
import { confirmGate } from "../src/runtime/confirm/confirm-gate";
import { codexInit } from "../src/init/templates";

const cwd = (): string => mkdtempSync(join(tmpdir(), "fh-confirm-cwd-"));
const home = (): string => mkdtempSync(join(tmpdir(), "fh-confirm-home-"));
const sid = (label: string): string => `${label}-${randomUUID()}`;

const pre = (id: string, s: string, command: string) => ({ hook_event_name: "PreToolUse", session_id: s, tool_use_id: randomUUID(), tool_name: "Bash", tool_input: { command } });
const codexPre = (s: string, command: string, toolUseId: string, workdir: string) => ({
  hook_event_name: "PreToolUse",
  session_id: s,
  tool_use_id: toolUseId,
  cwd: workdir,
  tool_name: "Bash",
  tool_input: { command },
});
const submit = (s: string, prompt: string) => ({ hook_event_name: "UserPromptSubmit", session_id: s, prompt });

/** Extract the 4-hex-char code from a "Pour autoriser, réponds : CONFIRM xxxx" deny message. */
function codeFromDeny(stdout: string): string {
  const m = stdout.match(/CONFIRM ([0-9a-f]{4})/i);
  const code = m?.[1];
  if (!code) throw new Error(`no CONFIRM code in: ${stdout}`);
  return code;
}

test("baseline unchanged: codex ask with no token -> deny carrying a CONFIRM code", async () => {
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: home() };
  const s = sid("baseline");
  const out = await handleHook("codex", pre("codex", s, "git commit -m confirm-baseline"), opts);
  const j = JSON.parse(out.stdout);
  expect(j.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(out.stdout).toContain("CONFIRM ");
});

test("claude-code untouched: native ask stays ask, no CONFIRM text ever added", async () => {
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: home() };
  const s = sid("claude-native");
  const out = await handleHook("claude-code", pre("claude-code", s, "git commit -m confirm-claude"), opts);
  const j = JSON.parse(out.stdout);
  expect(j.hookSpecificOutput.permissionDecision).toBe("ask");
  expect(out.stdout).not.toContain("Pour autoriser");
});

test("confirm the exact action -> next identical Bash call is allowed", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("confirm-ok");
  const cmd = "git commit -m confirm-ok-action";
  const denied = await handleHook("codex", pre("codex", s, cmd), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  const allowed = await handleHook("codex", pre("codex", s, cmd), { ...opts, now: 1200 });
  expect(allowed.stdout.includes('"permissionDecision":"deny"')).toBe(false);
});

test("codex fan-out: one confirmed tool_use_id allows sibling callbacks idempotently, then denies another id", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("codex-fanout");
  const cmd = "git commit -m confirm-fanout";
  const denied = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });

  const first = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), { ...opts, now: 1200 });
  const sibling = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), { ...opts, now: 1201 });
  const distinct = await handleHook("codex", codexPre(s, cmd, "tool-b", workdir), { ...opts, now: 1202 });

  expect(first.stdout).not.toContain('"permissionDecision":"deny"');
  expect(sibling.stdout).not.toContain('"permissionDecision":"deny"');
  expect(JSON.parse(distinct.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("G1: a consumed token cannot be replayed for the same action", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("g1-replay");
  const cmd = "git commit -m confirm-g1-replay";
  const denied = await handleHook("codex", pre("codex", s, cmd), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  await handleHook("codex", pre("codex", s, cmd), { ...opts, now: 1200 }); // consumes the token
  const replay = await handleHook("codex", pre("codex", s, cmd), { ...opts, now: 1300 });
  expect(JSON.parse(replay.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("codex consumed confirmation text cannot re-arm without a new denial", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("codex-submit-replay");
  const cmd = "git commit -m confirm-submit-replay";
  const denied = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), { ...opts, now: 1200 });
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1250 });
  const replay = await handleHook("codex", codexPre(s, cmd, "tool-b", workdir), { ...opts, now: 1300 });
  expect(JSON.parse(replay.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("G2: a token older than the 5-minute TTL is rejected", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("g2-stale");
  const cmd = "git commit -m confirm-g2-stale";
  const denied = await handleHook("codex", pre("codex", s, cmd), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  const tenMinLater = 1100 + 10 * 60 * 1000;
  const stale = await handleHook("codex", pre("codex", s, cmd), { ...opts, now: tenMinLater });
  expect(JSON.parse(stale.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("codex command mismatch invalidates the armed action", async () => {
  const cmdA = "git commit -m confirm-action-a";
  const cmdB = "git commit -m confirm-action-b";
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("command-mismatch");
  const deniedA = await handleHook("codex", codexPre(s, cmdA, "tool-a", workdir), opts);
  const code = codeFromDeny(deniedA.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  const deniedB = await handleHook("codex", codexPre(s, cmdB, "tool-b", workdir), { ...opts, now: 1200 });
  expect(JSON.parse(deniedB.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(deniedB.stdout).toContain("rejection: mismatch");
  const deniedAAgain = await handleHook("codex", codexPre(s, cmdA, "tool-a", workdir), { ...opts, now: 1300 });
  expect(JSON.parse(deniedAAgain.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("codex action identity canonicalizes argv/string transport and rejects a different cwd", async () => {
  const h = home();
  const workdir = cwd();
  const other = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s1 = sid("transport");
  const cmd = "git commit -m confirm-transport";
  const argv = { ...codexPre(s1, cmd, "tool-a", workdir), tool_input: { command: ["bash", "-lc", cmd] } };
  const denied = await handleHook("codex", argv, opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s1, `CONFIRM ${code}`), { ...opts, now: 1100 });
  const allowed = await handleHook("codex", codexPre(s1, cmd, "tool-a", workdir), { ...opts, now: 1200 });
  expect(allowed.stdout).not.toContain('"permissionDecision":"deny"');

  const s2 = sid("cwd");
  const deniedAtWorkdir = await handleHook("codex", codexPre(s2, cmd, "tool-b", workdir), opts);
  await handleHook("codex", submit(s2, `CONFIRM ${codeFromDeny(deniedAtWorkdir.stdout)}`), { ...opts, now: 1100 });
  const wrongCwd = await handleHook("codex", codexPre(s2, cmd, "tool-b", other), { ...opts, now: 1200 });
  expect(JSON.parse(wrongCwd.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(wrongCwd.stdout).toContain("rejection: mismatch");
});

test("codex diagnostics name rule, canonical command, expected token, and typed rejection", async () => {
  const workdir = cwd();
  const cmd = "echo log > out.txt";
  const out = await handleHook("codex", codexPre(sid("diagnostic"), cmd, "tool-a", workdir), { now: 1000, cwd: workdir, home: home() });
  expect(out.stdout).toContain("rule ID: bash-write:file-redirect");
  expect(out.stdout).toContain(`canonical command: ${cmd}`);
  expect(out.stdout).toMatch(/expected token: CONFIRM [0-9a-f]{4}/);
  expect(out.stdout).toContain("rejection: no-token");
});

test("codex UserPromptSubmit is wired and arms confirmation before scope early returns", async () => {
  const hooks = JSON.parse(codexInit("harness hook codex")[0]!.content) as { hooks: Record<string, unknown[]> };
  expect(hooks.hooks.UserPromptSubmit?.length).toBe(1);
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("scope-submit");
  const cmd = "git commit -m scope-submit";
  const denied = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100, scope: "rules" });
  const allowed = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), { ...opts, now: 1200 });
  expect(allowed.stdout).not.toContain('"permissionDecision":"deny"');
});

test("G4: git push --force is never confirmable (hard block, no CONFIRM code offered at all)", async () => {
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: home() };
  const s = sid("g4-force-push");
  const out = await handleHook("codex", pre("codex", s, "git push --force"), opts);
  expect(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(out.stdout).not.toContain("CONFIRM");
});

test("G4 unit: confirmGate never fires for an irreversible command even packaged as an ask prompt", () => {
  const askPrompt = { kind: "ask", title: "t", reason: "r" } as const;
  const verdict = confirmGate("codex", askPrompt, "git stash; rm -rf /tmp/whatever", "s-g4-unit", 1000);
  expect(verdict).toBeNull();
  expect(isIrreversible("git stash; rm -rf /tmp/whatever")).toBe(true);
});

test("G5: an explicit refusal invalidates a pending token before it can be used", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("g5-refusal");
  const cmd = "git commit -m confirm-g5-refusal";
  const denied = await handleHook("codex", pre("codex", s, cmd), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  await handleHook("codex", submit(s, "non merci, annule"), { ...opts, now: 1150 });
  const stillDenied = await handleHook("codex", pre("codex", s, cmd), { ...opts, now: 1200 });
  expect(JSON.parse(stillDenied.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("case/typo tolerance: confirm4f2a / Confirm-4f2a / CONFIRM_xxxx all parse", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("case-tolerant");
  const cmd = "git commit -m confirm-case-tolerant";
  const denied = await handleHook("codex", pre("codex", s, cmd), opts);
  const code = codeFromDeny(denied.stdout);
  await handleHook("codex", submit(s, `confirm${code}`), { ...opts, now: 1100 });
  const allowed = await handleHook("codex", pre("codex", s, cmd), { ...opts, now: 1200 });
  expect(allowed.stdout.includes('"permissionDecision":"deny"')).toBe(false);
});

test("kimi degrades ask to deny too, and honors the same CONFIRM flow", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("kimi-flow");
  const cmd = "git commit -m confirm-kimi";
  const denied = await handleHook("kimi", pre("kimi", s, cmd), opts);
  const j = JSON.parse(denied.stdout);
  expect(j.hookSpecificOutput.permissionDecision).toBe("deny");
  const code = codeFromDeny(denied.stdout);
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: 1100 });
  const allowed = await handleHook("kimi", pre("kimi", s, cmd), { ...opts, now: 1200 });
  expect(allowed.stdout.includes('"permissionDecision":"deny"')).toBe(false);
});
