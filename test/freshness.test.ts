import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { isDocConsulted, resolveSessions, formatDocDeny } from "../src/freshness/doc-helpers";
import { incrementTrivialEditCounter } from "../src/freshness/trivial-edit-counter";

test("resolveSessions: legacy + new + none", () => {
  expect(resolveSessions(undefined)).toEqual([]);
  expect(resolveSessions({ session: "s1" })).toEqual(["s1"]);
  expect(resolveSessions({ sessions: ["a", "b"] })).toEqual(["a", "b"]);
});

test("isDocConsulted: requires Context7 AND Exa", () => {
  const sid = "s1";
  expect(isDocConsulted({ react: { doc_sessions: [sid], sources: ["context7", "exa"] } }, sid)).toBe(true);
  expect(isDocConsulted({ react: { doc_sessions: [sid], sources: ["context7"] } }, sid)).toBe(false);
  expect(isDocConsulted(undefined, sid)).toBe(false);
});

test("isDocConsulted: satisfied via cache read paths", () => {
  const sid = "s1";
  const auth = {
    react: { doc_sessions: [sid], read_paths: ["/x/context/mcp/context7-abc", "/x/context/mcp/exa-search-def"] },
  };
  expect(isDocConsulted(auth, sid)).toBe(true);
});

test("formatDocDeny mentions both tools", () => {
  const m = formatDocDeny("react");
  expect(m).toContain("context7");
  expect(m).toContain("exa");
});

test("trivial-edit-counter: counts within window, evicts old", async () => {
  const f = join(mkdtempSync(join(tmpdir(), "fh-tec-")), "s.json");
  const win = 120_000;
  expect(await incrementTrivialEditCounter(f, win, 1000)).toBe(1);
  expect(await incrementTrivialEditCounter(f, win, 2000)).toBe(2);
  expect(await incrementTrivialEditCounter(f, win, 1_000_000)).toBe(1);
});
