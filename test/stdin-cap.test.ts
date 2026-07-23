import { test, expect } from "bun:test";
import { openSync, closeSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBounded, oversizeStdout } from "../src/cli/hook-io";
import { resolveStdinMaxBytes } from "../src/config/limits";

/** Write `text` to a temp file and read it back through readBounded. */
function readViaFile(text: string, cap: number): ReturnType<typeof readBounded> {
  const f = join(mkdtempSync(join(tmpdir(), "fh-stdin-")), "payload.json");
  writeFileSync(f, text);
  const fd = openSync(f, "r");
  try { return readBounded(fd, cap); } finally { closeSync(fd); }
}

const payload = (event: string, pad: number): string =>
  JSON.stringify({ hook_event_name: event, session_id: "s", tool_name: "Bash", tool_input: { command: "x".repeat(pad) } });

test("zone normal: small payload reads byte-identical", () => {
  const p = payload("PreToolUse", 100);
  const r = readViaFile(p, 16 * 1024 * 1024);
  expect(r).toEqual({ kind: "ok", text: p });
});

test("zone just-under-cap: exact cap bytes reads byte-identical", () => {
  const cap = 4096;
  let p = payload("PreToolUse", cap);
  p = p.slice(0, cap - 1) + "}";
  const r = readViaFile(p, cap);
  expect(r).toEqual({ kind: "ok", text: p });
});

test("zone over-cap: blockable event -> native deny; observation-only -> neutral", () => {
  const cap = 1024;
  const big = payload("PreToolUse", cap * 3);
  const r = readViaFile(big, cap);
  expect(r.kind).toBe("oversize");
  const deny = oversizeStdout("kimi", r.kind === "oversize" ? r.head : "");
  expect(JSON.parse(deny).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(deny).toContain("denied uninspected");
  const post = readViaFile(payload("PostToolUse", cap * 3), cap);
  expect(oversizeStdout("kimi", post.kind === "oversize" ? post.head : "")).toBe("");
});

test("zone over-cap: undeterminable event fails closed (deny), claude shape", () => {
  const r = readViaFile("x".repeat(3000), 1024);
  const deny = oversizeStdout("claude-code", r.kind === "oversize" ? r.head : "");
  expect(JSON.parse(deny).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("multi-chunk (cap > 64 KiB): head stays readable; PostToolUse oversize -> neutral", () => {
  const head = JSON.stringify({ hook_event_name: "PostToolUse", session_id: "s" }).slice(0, -1) + ', "pad": "';
  const big = head + "x".repeat(90 * 1024) + '"}';
  const r = readViaFile(big, 80 * 1024);
  expect(r.kind).toBe("oversize");
  const headText = r.kind === "oversize" ? r.head : "";
  expect(headText.includes("hook_event_name")).toBe(true);
  expect(oversizeStdout("kimi", headText)).toBe(""); // observation-only: neutral, no deny
});

test("override: FUSE_HOOK_STDIN_MAX_BYTES pins the cap; default is 16 MiB", () => {
  expect(resolveStdinMaxBytes({})).toBe(16 * 1024 * 1024);
  expect(resolveStdinMaxBytes({ FUSE_HOOK_STDIN_MAX_BYTES: "2048" })).toBe(2048);
  expect(resolveStdinMaxBytes({ FUSE_HOOK_STDIN_MAX_BYTES: "nope" })).toBe(16 * 1024 * 1024);
});
