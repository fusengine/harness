import { expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { listApprovals } from "../src/policy/motion/approvals";
import { motionPrompt } from "../src/runtime/motion/prompt";
import { motionCall } from "../src/runtime/motion/host";
import { normalizeEvent } from "../src/runtime/normalize";
import { codeOf } from "./motion-handle-fixture";
import { HOSTS, makeFixture, runHost, shell, userPrompt, type Host } from "./motion-hosts-fixture";

function assertNativeNotice(host: Host, out: string): void {
  if (host === "cursor") {
    expect(out).toBe("{}"); // Outer handleHook emits the neutral native envelope.
    return;
  }
  if (host === "kimi") {
    expect(out).toContain("Motion approval not granted");
    expect(out.startsWith("{")).toBe(false);
    return;
  }
  const native = JSON.parse(out) as Record<string, unknown>;
  const hook = native.hookSpecificOutput as Record<string, unknown> | undefined;
  expect(native.decision).not.toBe("deny");
  expect(native.decision).not.toBe("block");
  expect(native.cancel).not.toBe(true);
  expect(native.continue).not.toBe(false);
  expect(hook?.permissionDecision).toBeUndefined();
  const message = host === "cline" ? native.contextModification
    : host === "hermes" ? native.context : hook?.additionalContext;
  expect(message).toContain("Motion approval not granted");
  if (host === "claude-code" || host === "codex") {
    expect(hook?.hookEventName).toBe("UserPromptSubmit");
  }
}

for (const host of HOSTS) {
  for (const invalid of ["wrong-code", "wrong-stage", "no-pending", "changed-artifact"] as const) {
    test(`${host}: ${invalid} approval is native information, never a prompt refusal or grant`, async () => {
      const fx = makeFixture();
      const code = invalid === "no-pending" ? "0000"
        : codeOf(await runHost(fx, host, shell(host, "owner", "bash render.sh --stage draft", fx.proj)));
      const supplied = invalid === "wrong-code" ? (code === "0000" ? "ffff" : "0000") : code;
      const stage = invalid === "wrong-stage" ? "draft" : "stills";
      if (invalid === "changed-artifact") writeFileSync(fx.contact, "contact-v2");
      const payload = userPrompt(host, "owner", `MOTION-APPROVE ${stage} ${supplied}`, fx.proj);
      if (host === "cursor") {
        const call = motionCall(host, payload, normalizeEvent(host, payload));
        expect(motionPrompt(host, payload, call, "owner", { now: 1_000_000, cwd: fx.proj, home: fx.home })).toBe("");
      }
      if (invalid === "no-pending") await runHost(fx, host, shell(host, "owner", "ls", fx.proj));
      assertNativeNotice(host, await runHost(fx, host, payload));
      expect(listApprovals(realpathSync(fx.proj), fx.home)).toEqual([]);
    });
  }
}
