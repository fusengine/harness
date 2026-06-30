import { test, expect } from "bun:test";
import { evaluate } from "../src/policy/evaluate";
import { securityGuard } from "../src/policy/guards/security";
import { interfaceSeparationGuard } from "../src/policy/guards/interface-separation";
import { capVerbosity } from "../src/policy/verbosity";

test("GIT_ASK now covers commit/add/branch -d", () => {
  expect(evaluate({ tool: "Bash", command: "git commit -m x" }).prompt?.kind).toBe("ask");
  expect(evaluate({ tool: "Bash", command: "git add ." }).prompt?.kind).toBe("ask");
  expect(evaluate({ tool: "Bash", command: "git branch -d feat" }).prompt?.kind).toBe("ask");
});

test("security: new critical + ask coverage", () => {
  expect(securityGuard({ tool: "Bash", command: "shred -u secret" })?.kind).toBe("block");
  expect(securityGuard({ tool: "Bash", command: "echo x > /dev/sda" })?.kind).toBe("block");
  expect(securityGuard({ tool: "Bash", command: "rm -rf /usr/local" })?.kind).toBe("block");
  expect(securityGuard({ tool: "Bash", command: "su root" })?.kind).toBe("block");
  expect(securityGuard({ tool: "Bash", command: "unlink file" })?.kind).toBe("ask");
});

test("interface-separation: Go + Java", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "internal/handlers/user.go", content: "type UserRepo interface {\n}" })?.kind).toBe("block");
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/controllers/User.java", content: "public interface UserService {}" })?.kind).toBe("block");
});

test("verbosity: caps context7 tokens + exa tokensNum", () => {
  expect(capVerbosity("mcp__context7__query-docs", { tokens: 9000 })).toEqual({ tokens: 2000 });
  expect(capVerbosity("mcp__exa__get_code_context_exa", { numResults: 2, tokensNum: 9000 })).toEqual({ numResults: 2, tokensNum: 2000 });
});
