import { test, expect } from "bun:test";
import { validateSolidGate } from "../src/runtime/lifecycle/validate-solid";

// D0.2 (external audit): the 3 probes, each in both rollout modes.
const go = { SOLID_PROJECT_TYPE: "go", FUSE_CONVENTIONS_MODE: "advisory" };
const py = { SOLID_PROJECT_TYPE: "python", FUSE_CONVENTIONS_MODE: "advisory" };
const goDeny = { ...go, FUSE_CONVENTIONS_MODE: "deny" };
const pyDeny = { ...py, FUSE_CONVENTIONS_MODE: "deny" };

test("probe 1: Go `interface{` without space — advisory by default, deny on flag", () => {
  const src = "package h\n\ntype S interface{\n\tM() string\n}\n";
  const advisory = validateSolidGate("Write", "/p/handlers/s.go", src, go);
  expect(advisory).toContain("additionalContext"); // inform channel, non-blocking
  expect(advisory).not.toContain('"permissionDecision":"deny"');
  expect(validateSolidGate("Write", "/p/handlers/s.go", src, goDeny)).toContain('"permissionDecision":"deny"');
});

test("probe 2: Go interface LOCAL (indented inside a func) never matches", () => {
  const src = "package h\n\nfunc f() {\n\ttype local interface {\n\t\tM()\n\t}\n\t_ = 1\n}\n";
  expect(validateSolidGate("Write", "/p/handlers/s.go", src, go)).toBe("");
  expect(validateSolidGate("Write", "/p/handlers/s.go", src, goDeny)).toBe("");
});

test("probe 3: Python Protocol — advisory by default, deny on flag", () => {
  const src = "from typing import Protocol\n\nclass Repo(Protocol):\n    pass\n";
  const advisory = validateSolidGate("Write", "/p/src/repo.py", src, py);
  expect(advisory).toContain("additionalContext");
  expect(advisory).not.toContain('"permissionDecision":"deny"');
  expect(validateSolidGate("Write", "/p/src/repo.py", src, pyDeny)).toContain('"permissionDecision":"deny"');
});

test("legacy stays hard deny byte-identical in both modes", () => {
  const src = "package h\n\ntype S interface {\n\tM() string\n}\n";
  for (const env of [go, goDeny]) {
    expect(validateSolidGate("Write", "/p/handlers/s.go", src, env)).toBe(
      JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "SOLID: Interfaces must be in internal/interfaces/" } }),
    );
  }
  const abc = "from abc import ABC\n\nclass Repo(ABC):\n    pass\n";
  expect(validateSolidGate("Write", "/p/src/repo.py", abc, py)).toContain('"permissionDecisionReason":"SOLID: Abstract classes must be in src/interfaces/"');
});
