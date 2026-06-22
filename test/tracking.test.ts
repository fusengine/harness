import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { emptyTrack, recordDoc, recordRefRead, recordAgent, agentsFresh } from "../src/tracking/session-state";
import { loadTrack, saveTrack } from "../src/tracking/store";

test("record helpers are immutable + deduped", () => {
  const t0 = emptyTrack();
  const t1 = recordDoc(t0, "react", "s1", "context7");
  expect(t0.authorizations).toEqual({});
  expect(t1.authorizations.react?.doc_sessions).toEqual(["s1"]);
  expect(t1.authorizations.react?.sources).toContain("context7");
  const t2 = recordRefRead(recordRefRead(t1, "/p/a.md"), "/p/a.md");
  expect(t2.refsRead).toEqual(["/p/a.md"]);
});

test("agentsFresh: all required within window", () => {
  let t = emptyTrack();
  t = recordAgent(t, "explore-codebase", 1000);
  t = recordAgent(t, "research-expert", 2000);
  expect(agentsFresh(t, ["explore-codebase", "research-expert"], 5000, 3000)).toBe(true);
  expect(agentsFresh(t, ["explore-codebase", "research-expert"], 500, 10000)).toBe(false);
  expect(agentsFresh(t, ["sniper"], 5000, 3000)).toBe(false);
});

test("store: round-trip + empty default", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "fh-trk-")), "s.json");
  await saveTrack(file, recordDoc(emptyTrack(), "react", "s1", "exa"));
  expect((await loadTrack(file)).authorizations.react?.sources).toContain("exa");
  expect((await loadTrack("/no/such/file.json")).agents).toEqual([]);
});
