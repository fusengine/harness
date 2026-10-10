import { afterEach, expect, test } from "bun:test";
import { appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { HOSTS, makeFixture, runHost, shell, userPrompt, type MotionFixture } from "./motion-hosts-fixture";
import { codeOf } from "./motion-handle-fixture";
import { appendMotionContext } from "../src/runtime/motion/reply";
import { respond } from "../src/runtime/respond";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

for (const host of HOSTS) test(`${host}: first cold G1 keeps a valid native denial`, async () => {
  const f = makeFixture(); fixtures.push(f);
  const stdout = await runHost(f, host, shell(host, "context5", "bash render.sh --stage draft", f.proj));
  const result = JSON.parse(stdout) as Record<string, unknown>;
  if (host === "cursor") expect(result.permission).toBe("deny");
  else if (host === "gemini-cli") expect(result.decision).toBe("deny");
  else if (host === "hermes") expect(result.decision).toBe("block");
  else if (host === "cline") expect(result.cancel).toBe(true);
  else expect((result.hookSpecificOutput as Record<string, unknown>).permissionDecision).toBe("deny");
});

for (const host of HOSTS) test(`${host}: context append preserves every original decision leaf`, () => {
  const event = host === "cursor" ? "beforeShellExecution" : "PreToolUse";
  const original = respond(host, { kind: "block", title: "Original", reason: "original reason" }, event);
  const merged = JSON.parse(appendMotionContext(host, event, original, "new context")) as Record<string, unknown>;
  const before = JSON.parse(original) as Record<string, unknown>;
  for (const key of ["permission", "decision", "cancel", "reason", "errorMessage"]) if (Object.hasOwn(before, key)) expect(merged[key]).toEqual(before[key]);
  if (before.hookSpecificOutput) {
    const prior = before.hookSpecificOutput as Record<string, unknown>, after = merged.hookSpecificOutput as Record<string, unknown>;
    for (const key of ["permissionDecision", "permissionDecisionReason", "hookEventName"]) if (Object.hasOwn(prior, key)) expect(after[key]).toEqual(prior[key]);
  }
});

for (const host of HOSTS) test(`${host}: approval prompt still carries invalidation without blocking input`, async () => {
  const f = makeFixture(); fixtures.push(f);
  const denied = await runHost(f, host, shell(host, "context-prompt5", "bash render.sh --stage draft", f.proj));
  appendFileSync(join(f.proj, ".motion/project.json"), "\n");
  const stdout = await runHost(f, host, userPrompt(host, "context-prompt5", `MOTION-APPROVE stills ${codeOf(denied)}`, f.proj));
  expect(stdout).toContain("all approvals invalidated");
  if (host === "cursor") expect((JSON.parse(stdout) as Record<string, unknown>).continue).toBe(true);
});
