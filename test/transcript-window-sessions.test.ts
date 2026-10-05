/**
 * Sidecar keying: two sessions sharing one project state dir must not clobber each
 * other's index (each warm hook reads only appended bytes), stale siblings are
 * pruned, and a corrupt offset forces a verdict-preserving full re-scan.
 */
import { test, expect } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearTranscriptMemo, loadTranscriptIndex } from "../src/freshness/transcript-index";
import { sidecarPath } from "../src/freshness/transcript-sidecar";

const ROOT = mkdtempSync(join(tmpdir(), "tses-"));
const NOW = 1_800_000_000_000;
const use = (agent: string): string => JSON.stringify({ timestamp: NOW, message: { content: [{ type: "tool_use", name: "Task", input: { subagent_type: agent } }] } }) + "\n";

/** Overwrite one sidecar with a sentinel agent key: it survives only if the next hook is incremental. */
function plantSentinel(file: string): void {
  const j = JSON.parse(readFileSync(file, "utf8")) as { agents: unknown[] };
  j.agents.push(["SENTINEL", { ts: 1 }]);
  writeFileSync(file, JSON.stringify(j));
}

test("2 sessions alternating in one project dir: each warm hook is incremental (no rescan)", () => {
  const dir = mkdtempSync(join(ROOT, "proj-"));
  const files = ["a", "b"].map((n) => join(ROOT, `${n}.jsonl`));
  for (const f of files) writeFileSync(f, use("explore-codebase"));
  for (const f of files) { clearTranscriptMemo(); loadTranscriptIndex(f, dir); }
  expect(readdirSync(dir).filter((n) => n.startsWith("transcript-index-")).length).toBe(2);
  for (let round = 0; round < 6; round++) {
    for (const f of files) {
      plantSentinel(sidecarPath(dir, f));
      appendFileSync(f, use(`agent-${round}`));
      clearTranscriptMemo();
      const idx = loadTranscriptIndex(f, dir);
      expect(idx?.agents.has("SENTINEL")).toBe(true); // sidecar was reused, not rebuilt
      expect(idx?.agents.has(`agent-${round}`)).toBe(true); // appended bytes were folded in
    }
  }
});

test("stale sibling sidecars are pruned on write; fresh ones kept", () => {
  const dir = mkdtempSync(join(ROOT, "prune-"));
  const [old, fresh, cur] = ["o", "f", "c"].map((n) => join(ROOT, `${n}.jsonl`));
  for (const f of [old, fresh, cur]) writeFileSync(f!, use("research-expert"));
  for (const f of [old, fresh]) { clearTranscriptMemo(); loadTranscriptIndex(f!, dir); }
  const aged = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  utimesSync(sidecarPath(dir, old!), aged, aged);
  clearTranscriptMemo();
  loadTranscriptIndex(cur!, dir);
  const left = readdirSync(dir);
  expect(left).not.toContain(sidecarPath(dir, old!).split("/").pop()!);
  expect(left).toContain(sidecarPath(dir, fresh!).split("/").pop()!);
  expect(left).toContain(sidecarPath(dir, cur!).split("/").pop()!);
});

test("non-integer / negative / oversize sidecar offset => full rescan, same index", () => {
  const dir = mkdtempSync(join(ROOT, "bad-"));
  const f = join(ROOT, "bad.jsonl");
  writeFileSync(f, use("explore-codebase") + use("research-expert"));
  clearTranscriptMemo();
  const want = [...(loadTranscriptIndex(f, dir)?.agents ?? [])];
  for (const off of [1.5, -1, 1e9, Number.MAX_SAFE_INTEGER + 2]) {
    const file = sidecarPath(dir, f);
    const j = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...j, offset: off, agents: [["SENTINEL", { ts: 1 }]] }));
    clearTranscriptMemo();
    expect([...(loadTranscriptIndex(f, dir)?.agents ?? [])]).toEqual(want);
  }
});
