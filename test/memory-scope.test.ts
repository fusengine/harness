import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bashSeverity, agentSeverity, salience, SALIENCE_THRESHOLD } from "../src/runtime/lifecycle/memory/salience";
import { detectProjectType, appendMemoryLog, memoryLogDir } from "../src/runtime/lifecycle/memory/state";
import { neuralBase } from "../src/runtime/lifecycle/memory/client";
import { captureBashError } from "../src/runtime/lifecycle/memory/capture-error";
import { dispatchMemory } from "../src/runtime/lifecycle/memory/dispatch";

test("bashSeverity: keyword tiers", () => {
  expect(bashSeverity("FATAL crash")).toBe(10);
  expect(bashSeverity("Error: failed")).toBe(8);
  expect(bashSeverity("a warning")).toBe(4);
  expect(bashSeverity("deprecated api")).toBe(2);
  expect(bashSeverity("plain text")).toBe(5);
});

test("agentSeverity: agent name tiers", () => {
  expect(agentSeverity("sniper")).toBe(8);
  expect(agentSeverity("research-expert")).toBe(6);
  expect(agentSeverity("laravel-expert")).toBe(7);
  expect(agentSeverity("explore-codebase")).toBe(5);
});

test("salience: formula + threshold (all real severities pass)", () => {
  expect(salience(10)).toBeCloseTo(0.85, 5);
  expect(salience(2)).toBeCloseTo(0.53, 5);
  expect(salience(2)).toBeGreaterThan(SALIENCE_THRESHOLD);
});

test("detectProjectType: marker files", () => {
  const root = mkdtempSync(join(tmpdir(), "fh-mem-"));
  expect(detectProjectType(root)).toBe("unknown");
  writeFileSync(join(root, "Cargo.toml"), "");
  expect(detectProjectType(root)).toBe("rust");
});

test("appendMemoryLog: writes + rotates to newest lines on overflow", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-memhome-"));
  for (let i = 0; i < 12; i++) appendMemoryLog("operations.log", `line-${i}`, 10, 5, home);
  // line-10 append makes 11 > 10 → trim to last 5 (line-6..10); line-11 append → 6 lines.
  const lines = readFileSync(join(memoryLogDir(home), "operations.log"), "utf-8").split("\n").filter(Boolean);
  expect(lines.length).toBeLessThanOrEqual(10);
  expect(lines[0]).toBe("line-6");
  expect(lines.at(-1)).toBe("line-11");
});

test("neuralBase: env-overridable", () => {
  expect(neuralBase({} as NodeJS.ProcessEnv)).toBe("http://localhost:8000");
  expect(neuralBase({ NEURAL_MEMORY_HOST: "h", GRAPHITI_PORT: "9" } as unknown as NodeJS.ProcessEnv)).toBe("http://h:9");
});

test("captureBashError: no-op on success / no stderr (no network)", async () => {
  expect(await captureBashError({ tool_result: { exit_code: 0, stderr: "boom" } }, Date.now())).toBe("");
  expect(await captureBashError({ tool_result: { exit_code: 1, stderr: "" } }, Date.now())).toBe("");
});

test("dispatchMemory: unhandled events + non-memory tools return null", async () => {
  expect(await dispatchMemory("PreToolUse", {}, "/tmp", Date.now())).toBeNull();
  expect(await dispatchMemory("PostToolUse", { tool_name: "Read" }, "/tmp", Date.now())).toBeNull();
});

test("dispatchMemory: graphiti PostToolUse tracks op (side-effect, empty stdout)", async () => {
  const out = await dispatchMemory("PostToolUse", { tool_name: "mcp__qdrant__qdrant-find" }, "/tmp", Date.now());
  expect(out).toBe("");
});
