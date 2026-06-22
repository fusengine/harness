import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

test("blocks sed -i on a code file", () => {
  const ctx: GuardContext = { tool: "Bash", command: "sed -i 's/foo/bar/' src/index.ts" };
  expect(bashWriteGuard(ctx)?.kind).toBe("block");
});

test("blocks redirect to a code-file extension + python3 -c", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "echo x > app.tsx" })?.kind).toBe("block");
  expect(bashWriteGuard({ tool: "Bash", command: "python3 -c 'print(1)'" })?.kind).toBe("block");
});

test("asks before redirect to a non-code file", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "echo log >> out.txt" })?.kind).toBe("ask");
});

test("passes a plain read + non-Bash tool", () => {
  expect(bashWriteGuard({ tool: "Bash", command: "ls -la src" })).toBeNull();
  expect(bashWriteGuard({ tool: "Write", command: "sed -i x a.ts" })).toBeNull();
});
