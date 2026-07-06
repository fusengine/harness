import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY } from "../src/tracking/one-shot-store";
import { applyFailure, recordFailure } from "../src/tracking/one-shot-failure";

const dir = (): string => mkdtempSync(join(tmpdir(), "fh-fail-"));

test("applyFailure: increments per-tool count without touching gates/pending", () => {
  const s = applyFailure({ ...EMPTY }, "Bash", 100);
  expect(s.failures).toEqual({ Bash: 1 });
  expect(s.gates).toEqual({});
  expect(s.firstTry).toBe(0);
  expect(applyFailure(s, "Bash", 200).failures).toEqual({ Bash: 2 });
});

test("recordFailure: persists the tally to the one-shot sidecar", () => {
  const d = dir();
  recordFailure("Edit", { now: 1000, dir: d });
  const state = JSON.parse(readFileSync(join(d, "one-shot.json"), "utf8"));
  expect(state.failures.Edit).toBe(1);
});

test("recordFailure: burst-dedups the ~11-process fan-out for one session", () => {
  const d = dir();
  const opts = { now: 1000, dir: d, sessionId: "s1" };
  recordFailure("Bash", opts);
  recordFailure("Bash", { ...opts, now: 1500 });
  const state = JSON.parse(readFileSync(join(d, "one-shot.json"), "utf8"));
  expect(state.failures.Bash).toBe(1);
});
