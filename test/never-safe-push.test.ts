import { test, expect } from "bun:test";
import { evaluate } from "../src/policy/evaluate";
import type { PolicyContext } from "../src/policy/interfaces/types";

const never = (command: string): PolicyContext => ({ tool: "Bash", command, neverApproval: true });

test("neverApproval: plain `git push` auto-approves with a visible warn + notice", () => {
  const r = evaluate(never("git push origin main"));
  expect(r.decision).toBe("warn");
  expect(r.prompt?.kind).toBe("inform");
  expect(r.prompt?.userMessage).toContain("Auto-approved");
});

test("neverApproval: `git push -u origin <branch>` auto-approves", () => {
  const r = evaluate(never("git push -u origin feat/x"));
  expect(r.decision).toBe("warn");
  expect(r.prompt?.kind).toBe("inform");
});

test("neverApproval: `git push --force` still hard-blocks (GIT_BLOCKED wins over the push exemption)", () => {
  const r = evaluate(never("git push --force"));
  expect(r.decision).toBe("deny");
  expect(r.prompt?.kind).toBe("block");
});

test("neverApproval: `git push --force-with-lease` still hard-blocks", () => {
  const r = evaluate(never("git push --force-with-lease"));
  expect(r.decision).toBe("deny");
  expect(r.prompt?.kind).toBe("block");
});

test("neverApproval: `git push origin --delete <branch>` (remote deletion) falls through to ask, never warn", () => {
  const r = evaluate(never("git push origin --delete br"));
  expect(r.decision).toBe("deny");
  expect(r.prompt?.kind).toBe("ask");
});

test("neverApproval: `git push origin :<branch>` (refspec-colon remote delete) falls through to ask", () => {
  const r = evaluate(never("git push origin :br"));
  expect(r.decision).toBe("deny");
  expect(r.prompt?.kind).toBe("ask");
});

test("neverApproval: `git push origin +main` (leading-+ force refspec ≡ --force) falls through to ask, never warn", () => {
  const r = evaluate(never("git push origin +main"));
  expect(r.decision).toBe("deny");
  expect(r.prompt?.kind).toBe("ask");
});

test("neverApproval: `git push origin +src:dst` (force refspec pair) falls through to ask", () => {
  const r = evaluate(never("git push origin +feat:main"));
  expect(r.decision).toBe("deny");
  expect(r.prompt?.kind).toBe("ask");
});

test("neverApproval: a `feature+x` ref name is NOT a force refspec — still auto-approves", () => {
  const r = evaluate(never("git push origin feature+x"));
  expect(r.decision).toBe("warn");
  expect(r.prompt?.kind).toBe("inform");
});

test("neverApproval anti-chaining: a chained push still denies", () => {
  const r = evaluate(never("git push origin main && rm -rf /tmp/x"));
  expect(r.decision).toBe("deny");
});

test("RALPH_MODE unaffected: plain push without neverApproval still asks (push stays out of RALPH_SAFE)", () => {
  process.env.RALPH_MODE = "1";
  try {
    const r = evaluate({ tool: "Bash", command: "git push origin main" });
    expect(r.decision).toBe("deny");
    expect(r.prompt?.kind).toBe("ask");
  } finally {
    delete process.env.RALPH_MODE;
  }
});
