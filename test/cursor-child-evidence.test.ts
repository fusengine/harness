/**
 * Cursor runs each sub-agent under its OWN conversation_id: its explore/research/doc
 * evidence lands in the child track, invisible to the parent that writes code. At
 * the parent's `subagentStop` (which carries `child_conversation_id`), the child's
 * evidence is folded into the parent. Cursor-only; Claude/Codex unchanged.
 */
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { mergeChildEvidence } from "../src/freshness/child-evidence-merge";
import { emptyTrack, recordAgent, recordDoc, recordRefRead, recordTarget } from "../src/tracking/session-state";

const NOW = 1_800_000_000_000;

test("merge: copies child agents/refs/docs; dedups; never makes the parent less fresh; idempotent under fan-out", () => {
  let child = recordAgent(emptyTrack(), "explore-codebase", NOW - 100, "sufficient");
  child = recordAgent(child, "research-expert", NOW - 90, "sufficient");
  child = recordRefRead(child, "/r/solid.md", NOW - 80);
  child = recordDoc(child, "react", "child", "context7", NOW - 70);
  let parent = recordRefRead(emptyTrack(), "/r/solid.md", NOW); // parent's read is NEWER
  parent = recordDoc(parent, "react", "P", "exa", NOW + 5); // parent's doc is NEWER
  const once = mergeChildEvidence(parent, child, "P");
  expect(once.agents.map((a) => a.name).sort()).toEqual(["explore-codebase", "research-expert"]);
  expect(once.refsReadAt?.["/r/solid.md"]).toBe(NOW); // not regressed to NOW-80
  expect(once.authorizations.react?.doc_consulted).toBe(new Date(NOW + 5).toISOString()); // not regressed
  // 13 sibling hook processes replaying the same stop: no duplicates.
  let many = once;
  for (let i = 0; i < 13; i++) many = mergeChildEvidence(many, child, "P");
  expect(many.agents.length).toBe(2);
  // A doc the parent never consulted is credited to the PARENT session.
  const fresh = mergeChildEvidence(emptyTrack(), child, "P");
  expect(fresh.authorizations.react?.doc_sessions).toContain("P");
});

test("merge docs: no target cross-credit, and a parent stamp is never regressed by an older child read", () => {
  const child = recordDoc(emptyTrack(), "react", "C", "context7", NOW - 1000);
  // Parent was denied on "astro" (target) AFTER the child's react read: the merge must not unlock astro.
  const denied = recordTarget(emptyTrack(), { project: "/p", framework: "astro", set_by: "deny", set_at: new Date(NOW).toISOString() });
  const merged = mergeChildEvidence(denied, child, "P");
  expect(merged.authorizations.astro).toBeUndefined();
  expect(merged.authorizations.react?.doc_sessions).toEqual(["P"]);
  // Parent track holds react from ANOTHER session, newer than the child: P is credited at the
  // CHILD's own (older) time — another session's fresh stamp must never freshen a stale read.
  const other = recordDoc(emptyTrack(), "react", "OTHER", "exa", NOW + 50);
  const kept = mergeChildEvidence(other, child, "P");
  expect(kept.authorizations.react?.doc_sessions).toEqual(["OTHER", "P"]);
  expect(kept.authorizations.react?.doc_consulted).toBe(new Date(NOW - 1000).toISOString());
});

/** Real CLI in a child process with an isolated HOME (Bun caches os.homedir()). */
function hook(host: string, payload: Record<string, unknown>, cwd: string, home: string): string {
  const bin = join(import.meta.dir, "..", "src", "cli", "bin.ts");
  return Bun.spawnSync(["bun", bin, "hook", host, "core"], { cwd, env: { PATH: process.env.PATH ?? "", HOME: home }, stdin: Buffer.from(JSON.stringify(payload)), timeout: 30_000 }).stdout.toString();
}

/** The real Cursor sequence: child explores + researches under its own id, parent writes before/after the child's stop. */
function scenario(host: string): { before: string; after: string } {
  const home = mkdtempSync(join(tmpdir(), "fh-cce-home-")), cwd = mkdtempSync(join(tmpdir(), "fh-cce-cwd-"));
  const P = randomUUID(), C = randomUUID();
  const ids = (s: string) => ({ conversation_id: s, session_id: s, generation_id: randomUUID(), workspace_roots: [cwd], cwd });
  const out = "x".repeat(2000);
  hook(host, { ...ids(C), hook_event_name: "postToolUse", tool_name: "Shell", tool_input: { command: "rg -n halo src" }, tool_output: out, tool_use_id: randomUUID() }, cwd, home);
  hook(host, { ...ids(C), hook_event_name: "postToolUse", tool_name: "MCP:query-docs", tool_input: { libraryId: "/withastro/docs", query: "islands" }, tool_output: out, tool_use_id: randomUUID() }, cwd, home);
  // ≥ 5 lines: Cursor maps Write to Edit, and a < 5-line Edit would take the trivial-edit fast path.
  const content = Array.from({ length: 8 }, (_, i) => `export const fmt${i} = (n: number): string => n.toFixed(${i});`).join("\n");
  const write = { ...ids(P), hook_event_name: "preToolUse", tool_name: "Write", tool_input: { file_path: join(cwd, "src", "lib", "format.ts"), content }, tool_use_id: randomUUID() };
  const before = hook(host, write, cwd, home);
  hook(host, { ...ids(P), hook_event_name: "subagentStop", subagent_id: "toolu_x", subagent_type: "explore-codebase", status: "completed", parent_conversation_id: P, child_conversation_id: C }, cwd, home);
  return { before, after: hook(host, write, cwd, home) };
}

test("cursor end to end: the parent is blocked before the child's stop, and no longer for explore + research after it", () => {
  const { before, after } = scenario("cursor");
  expect(before).toContain("explore + research required");
  expect(after).not.toContain("explore + research required");
}, 60_000);

test("non-cursor payload carrying the same fields: nothing is merged (Claude unchanged)", () => {
  const { before, after } = scenario("claude-code");
  expect(before).toContain("explore + research required");
  expect(after).toContain("explore + research required");
}, 60_000);
