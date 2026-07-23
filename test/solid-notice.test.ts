import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noticeFingerprint, shouldEmitNotice } from "../src/runtime/lifecycle/aipilot/solid-notice";
import { checkSolidFromTranscript } from "../src/runtime/lifecycle/aipilot/solid-transcript";
import { projectLayout, STATE_GITIGNORE } from "../src/config/layout";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-notice-"));
const file = (d: string): string => join(d, "solid-notice.json");

test("dedup: same set twice -> one emission then silence; modified set -> re-emit", () => {
  const d = dir();
  const v = ["SOLID: a.ts: move interfaces to interfaces/", "SOLID: b.ts = 150 lines (max 100)"];
  const h = noticeFingerprint(v);
  expect(shouldEmitNotice(file(d), "agent-1", h, 1000, 120_000)).toBe(true);
  expect(shouldEmitNotice(file(d), "agent-1", h, 2000, 120_000)).toBe(false);
  const h2 = noticeFingerprint([v[0]!]);
  expect(shouldEmitNotice(file(d), "agent-1", h2, 3000, 120_000)).toBe(true);
});

test("dedup: different key -> emission; TTL expired -> one reminder", () => {
  const d = dir();
  const h = noticeFingerprint(["x"]);
  expect(shouldEmitNotice(file(d), "agent-1", h, 1000, 100)).toBe(true);
  expect(shouldEmitNotice(file(d), "agent-2", h, 1001, 100)).toBe(true);
  expect(shouldEmitNotice(file(d), "agent-1", h, 1002, 100)).toBe(false);
  expect(shouldEmitNotice(file(d), "agent-1", h, 1000 + 101, 100)).toBe(true); // TTL expired
});

test("sidecar: lands under .harness/track/, covered by the selective gitignore", () => {
  const layout = projectLayout("/proj");
  expect(layout.solidNoticeFile).toBe("/proj/.harness/track/solid-notice.json");
  expect(STATE_GITIGNORE).toContain("track/");
});

test("end-to-end: same transcript emits once across two SubagentStop calls", async () => {
  const root = dir();
  mkdirSync(join(root, "components"), { recursive: true });
  const comp = join(root, "components/Btn.tsx");
  writeFileSync(comp, "export interface Props { label: string }\n");
  const t = join(root, "agent.jsonl");
  const line = JSON.stringify({ message: { content: [{ type: "tool_use", name: "Write", input: { file_path: comp } }] } });
  writeFileSync(t, line);
  const first = await checkSolidFromTranscript(t, root, 5000);
  expect(first).toContain("Btn.tsx");
  const second = await checkSolidFromTranscript(t, root, 6000);
  expect(second).toBe("");
  expect(existsSync(projectLayout(root).solidNoticeFile)).toBe(true);
  const state = JSON.parse(readFileSync(projectLayout(root).solidNoticeFile, "utf8"));
  expect(state[t].hash).toBe(noticeFingerprint([`SOLID: Btn.tsx: move interfaces to interfaces/`]));
});
