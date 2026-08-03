import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDesignCacheDir } from "../src/runtime/design-cache-resolve";
import { activeDesignAgent, setActiveDesignAgent } from "../src/policy/design/flag";
import { handleHook, type HandleOptions } from "../src/runtime/handle";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-dcr-"));

test("resolveDesignCacheDir: no/invalid session id -> unchanged cwd dir (legacy fallback)", () => {
  const cwdCache = dir();
  expect(resolveDesignCacheDir("", cwdCache, dir())).toBe(cwdCache);
});

test("resolveDesignCacheDir: state already exists at cwd, nothing at session -> resolves to cwd (non-regression)", () => {
  const cwdCache = dir();
  setActiveDesignAgent(cwdCache, "ag-legacy");
  const home = dir();
  expect(resolveDesignCacheDir("sess-1", cwdCache, home)).toBe(cwdCache);
});

test("resolveDesignCacheDir: state exists at session dir -> resolves to session dir even if cwd is populated too", () => {
  const cwdCache = dir();
  setActiveDesignAgent(cwdCache, "ag-legacy");
  const home = dir();
  const sessionDir = join(home, ".fuse-harness", "design-sessions", "sess-2");
  setActiveDesignAgent(sessionDir, "ag-new");
  expect(resolveDesignCacheDir("sess-2", cwdCache, home)).toBe(sessionDir);
});

test("resolveDesignCacheDir: nothing anywhere -> defaults to the session dir (closes the silent fail-open)", () => {
  const cwdCache = dir();
  const home = dir();
  const resolved = resolveDesignCacheDir("sess-3", cwdCache, home);
  expect(resolved).toBe(join(home, ".fuse-harness", "design-sessions", "sess-3"));
  expect(resolved).not.toBe(cwdCache);
});

/**
 * The bug case, reproduced through the REAL `handleHook()` entry point (not a
 * hand-rolled `designGate` call): SubagentStart resolves under cwd A, the
 * agent's write lands under cwd B, same session id throughout. Pre-fix, the
 * cwd-keyed `mcpDir` diverges between the two calls, `designLifecycle` writes
 * the flag+state under A, and the write's `designGate(..., mcpDir(B), ...)`
 * finds nothing there — `activeDesignAgent` is empty, `designGate` returns
 * null (runtime/design.ts:52) and the `.tsx` write is silently ALLOWED.
 * Post-fix, both calls resolve the SAME session-anchored dir regardless of
 * cwd, so the gate sees the active agent and BLOCKS with the real
 * `htmlCssOnlyGate` design-pipeline message.
 *
 * `scope: "solid"` isolates the signal: it skips the unrelated generic APEX
 * freshness gate (`gate()` in handle-pre.ts, reached only when `designGate`
 * itself returns null) that would otherwise ALSO deny the write — for a
 * completely different reason — and mask whether the design gate fired.
 */
test("SubagentStart in cwd A, write in cwd B, same session -> BLOCKED by the design pipeline (the reported bug)", async () => {
  const home = dir();
  const cwdA = dir();
  const cwdB = dir();
  const sessionId = "bug-repro-session";
  const agentId = "design-a1";

  const startPayload = { hook_event_name: "SubagentStart", agent_id: agentId, agent_type: "fuse-design:design-expert", session_id: sessionId };
  const startOpts: HandleOptions = { now: 1000, cwd: cwdA, home };
  await handleHook("claude-code", startPayload, startOpts);

  const writePayload = {
    hook_event_name: "PreToolUse",
    session_id: sessionId,
    agent_id: agentId,
    tool_name: "Write",
    tool_input: { file_path: join(cwdB, "Foo.tsx"), content: "export default function Foo(){ return null; }" },
  };
  const writeOpts: HandleOptions = { now: 2000, cwd: cwdB, home, scope: "solid" };
  const out = await handleHook("claude-code", writePayload, writeOpts);

  expect(out.exit).toBe(0);
  expect(out.stdout).toContain("Design pipeline");
  expect(out.stdout).toContain("can only write .html, .css, .json, .md");
});

test("FALSIFIABILITY: without the session anchor (cwd-only resolution), the same scenario is silently ALLOWED", () => {
  // Simulates the pre-fix resolution: mcpDir computed strictly from each
  // call's own cwd (projectLayout(cwd).cacheDir), never anchored on session.
  const cwdA = dir();
  const cwdB = dir();
  setActiveDesignAgent(cwdA, "design-a1"); // designLifecycle wrote the flag under A's cacheDir
  expect(activeDesignAgent(cwdB)).toBe(""); // B's cacheDir never saw it -> designGate fails open
});

test("resolveDesignCacheDir: read and write target the same location within one session (no divergence)", () => {
  const cwdCache = dir();
  const home = dir();
  const first = resolveDesignCacheDir("sess-4", cwdCache, home);
  // First call decided "session dir" (nothing existed anywhere); a real write
  // would land there. Simulate it, then confirm the SECOND call in the same
  // session resolves to the SAME dir, not back to cwdCache.
  setActiveDesignAgent(first, "ag");
  const second = resolveDesignCacheDir("sess-4", cwdCache, home);
  expect(second).toBe(first);
});
