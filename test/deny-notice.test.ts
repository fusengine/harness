import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import figures from "figures";
import { denyAskNotice, withDenyNotice } from "../src/runtime/deny-notice";
import { respond } from "../src/runtime/respond";
import type { Prompt } from "../src/prompt/types";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-deny-notice-"));

test("denyAskNotice: block -> figures.cross title, ask -> ? title, inform -> null", () => {
  expect(denyAskNotice({ kind: "block", title: "SOLID file-size limit", reason: "r" })).toBe(`${figures.cross} SOLID file-size limit`);
  expect(denyAskNotice({ kind: "ask", title: "Git rebase", reason: "r" })).toBe("? Git rebase");
  expect(denyAskNotice({ kind: "inform", title: "x", reason: "" })).toBeNull();
});

test("denyAskNotice: an explicit prompt.userMessage wins over the generic default", () => {
  const p: Prompt = { kind: "block", title: "t", reason: "r", userMessage: "custom human line" };
  expect(denyAskNotice(p)).toBe("custom human line");
});

test("withDenyNotice: claude-code/codex get systemMessage attached, permissionDecision/Reason stay byte-intact", () => {
  const dir = tmp();
  const prompt: Prompt = { kind: "block", title: "SOLID file-size limit", reason: "150 lines" };
  const before = respond("claude-code", prompt);
  const after = withDenyNotice("claude-code", before, prompt, "s1", dir, 1000);
  const beforeParsed = JSON.parse(before) as { hookSpecificOutput: unknown };
  const afterParsed = JSON.parse(after) as { hookSpecificOutput: unknown; systemMessage?: string };
  expect(afterParsed.hookSpecificOutput).toEqual(beforeParsed.hookSpecificOutput);
  expect(afterParsed.systemMessage).toBe(`${figures.cross} SOLID file-size limit`);
});

test("withDenyNotice: cursor/hermes/cline pass stdout through byte-identical", () => {
  const dir = tmp();
  const prompt: Prompt = { kind: "block", title: "t", reason: "r" };
  for (const id of ["cursor", "hermes", "cline", "gemini-cli"]) {
    const before = respond(id, prompt);
    expect(withDenyNotice(id, before, prompt, "s1", dir, 1000)).toBe(before);
  }
});

test("withDenyNotice: dedup suppresses a 2nd identical (session, title) within the burst window", () => {
  const dir = tmp();
  const prompt: Prompt = { kind: "ask", title: "Git rebase", reason: "r" };
  const before = respond("claude-code", prompt);
  const first = withDenyNotice("claude-code", before, prompt, "s1", dir, 1000);
  expect(JSON.parse(first).systemMessage).toBe("? Git rebase");
  const second = withDenyNotice("claude-code", before, prompt, "s1", dir, 1500);
  expect(second).toBe(before);
  // A different session gets its own notice even inside the same window.
  const other = withDenyNotice("claude-code", before, prompt, "s2", dir, 1500);
  expect(JSON.parse(other).systemMessage).toBe("? Git rebase");
});

test("withDenyNotice: also covers the designGate/applyPatchGate deny paths (handle-pre.ts's other two respond() call sites)", () => {
  const dir = tmp();
  const designPrompt: Prompt = { kind: "block", title: "Design pipeline", reason: "BLOCKED: follow the pipeline" };
  const patchPrompt: Prompt = { kind: "block", title: "SOLID file-size limit", reason: "150 lines" };
  expect(JSON.parse(withDenyNotice("claude-code", respond("claude-code", designPrompt), designPrompt, "sD1", dir, 1000)).systemMessage).toBe(`${figures.cross} Design pipeline`);
  expect(JSON.parse(withDenyNotice("codex", respond("codex", patchPrompt), patchPrompt, "sD2", dir, 1000)).systemMessage).toBe(`${figures.cross} SOLID file-size limit`);
});
