import { test, expect } from "bun:test";
import { isRalphMode } from "../src/policy/patterns";
import { evaluate } from "../src/policy/evaluate";
import { installGuard } from "../src/policy/guards/install";
import type { PolicyContext } from "../src/policy/interfaces/types";
import type { GuardContext } from "../src/policy/guards/context";

const pc = (command: string): PolicyContext => ({ tool: "Bash", command });
const gc = (command: string): GuardContext => ({ tool: "Bash", command });

test("isRalphMode: OFF by default, ON only via the RALPH_MODE env var", () => {
  expect(isRalphMode()).toBe(false);
  process.env.RALPH_MODE = "1";
  try {
    expect(isRalphMode()).toBe(true);
  } finally {
    delete process.env.RALPH_MODE;
  }
});

test("evaluate: Ralph mode exempts safe git commands from the ASK, keeps destructive blocked", () => {
  expect(evaluate(pc("git commit -m x")).decision).toBe("deny"); // default: asks
  process.env.RALPH_MODE = "1";
  try {
    expect(evaluate(pc("git commit -m x")).decision).toBe("allow"); // safe -> exempt
    expect(evaluate(pc("git push --force")).prompt?.kind).toBe("block"); // destructive stays blocked
  } finally {
    delete process.env.RALPH_MODE;
  }
});

test("installGuard: Ralph mode auto-approves a project install, a system install still asks", () => {
  expect(installGuard(gc("npm install x"))?.kind).toBe("ask");
  process.env.RALPH_MODE = "1";
  try {
    expect(installGuard(gc("npm install x"))).toBeNull(); // project -> exempt
    expect(installGuard(gc("brew install x"))?.kind).toBe("ask"); // system -> still asks
  } finally {
    delete process.env.RALPH_MODE;
  }
});
