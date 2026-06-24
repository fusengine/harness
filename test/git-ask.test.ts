import { test, expect } from "bun:test";
import { evaluate } from "../src/policy/evaluate";

test("git: destructive → deny(block), normal → ask, non-git → allow", () => {
  expect(evaluate({ tool: "Bash", command: "git push --force" }).prompt?.kind).toBe("block");
  expect(evaluate({ tool: "Bash", command: "git push origin main" }).prompt?.kind).toBe("ask");
  expect(evaluate({ tool: "Bash", command: "git checkout main" }).prompt?.kind).toBe("ask");
  expect(evaluate({ tool: "Bash", command: "git status" }).decision).toBe("allow");
  expect(evaluate({ tool: "Bash", command: "ls -la" }).decision).toBe("allow");
});
