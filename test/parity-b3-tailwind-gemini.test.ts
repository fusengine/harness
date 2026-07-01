import { test, expect } from "bun:test";
import { isTailwindWrite, tailwindBaseSkillRead, tailwindSkillGate } from "../src/policy/tailwind-skill-gate";
import { geminiMcpEnforced, geminiMcpConsulted, geminiMcpGate } from "../src/policy/gemini-mcp-gate";

/** A .tsx snippet carrying >= 3 distinct Tailwind utility classes (flex, p-4, bg-red-500). */
const TW = `<div className="flex p-4 bg-red-500">`;

test("tailwindSkillGate: .tsx with Tailwind + no base skill read -> block; base skill read -> allow", () => {
  expect(isTailwindWrite("Write", "src/Card.tsx", TW)).toBe(true);
  expect(isTailwindWrite("Write", "src/util.ts", TW)).toBe(false); // not .tsx/.jsx
  expect(isTailwindWrite("Write", "node_modules/x/C.tsx", TW)).toBe(false); // excluded dir
  expect(tailwindSkillGate("Write", "src/Card.tsx", TW, [])?.kind).toBe("block");
  expect(tailwindSkillGate("Write", "src/Card.tsx", TW, ["/p/skills/tailwindcss-v4/SKILL.md"])).toBeNull();
  expect(tailwindBaseSkillRead(["/p/skills/tailwindcss-utilities/SKILL.md"])).toBe(true);
  expect(tailwindBaseSkillRead(["/p/skills/react-19/SKILL.md"])).toBe(false);
});

test("geminiMcpGate: OFF by default (env unset) -> no-op regardless of Tailwind content", () => {
  expect(geminiMcpEnforced()).toBe(false);
  expect(geminiMcpGate("Write", "src/Card.tsx", TW, { sessionId: "s1" })).toBeNull();
});

test("geminiMcpGate: ON via env -> blocks hand-written Tailwind UI unless Gemini MCP called", () => {
  process.env.FUSE_ENFORCE_GEMINI_MCP = "1";
  try {
    expect(geminiMcpEnforced()).toBe(true);
    expect(geminiMcpGate("Write", "src/Card.tsx", TW, { sessionId: "s1" })?.kind).toBe("block");
    expect(geminiMcpGate("Write", "src/util.ts", TW, { sessionId: "s1" })).toBeNull(); // not a UI ext
    expect(geminiMcpGate("Write", "src/Card.tsx", `<div className="flex">`, { sessionId: "s1" })).toBeNull(); // < 3 classes
    const ev = { sessionId: "s1", authorizations: { g: { doc_sessions: ["s1"], sources: ["gemini-mcp"] } } };
    expect(geminiMcpGate("Write", "src/Card.tsx", TW, ev)).toBeNull(); // Gemini MCP consulted -> allow
  } finally {
    delete process.env.FUSE_ENFORCE_GEMINI_MCP;
  }
});

test("geminiMcpConsulted: true only for a gemini-mcp source recorded in the current session", () => {
  const sid = "s1";
  expect(geminiMcpConsulted(undefined, sid)).toBe(false);
  expect(geminiMcpConsulted({ x: { doc_sessions: [sid], sources: ["gemini-mcp"] } }, sid)).toBe(true);
  expect(geminiMcpConsulted({ x: { doc_sessions: ["other"], sources: ["gemini-mcp"] } }, sid)).toBe(false);
  expect(geminiMcpConsulted({ x: { doc_sessions: [sid], sources: ["context7"] } }, sid)).toBe(false);
});
