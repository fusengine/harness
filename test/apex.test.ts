import { test, expect } from "bun:test";
import { evaluateApex, docConsultedGate, solidReadGate, type ApexContext } from "../src/policy/apex";
import type { RefMeta } from "../src/refs/types";

const sid = "s1";
const consulted = { react: { doc_sessions: [sid], sources: ["context7", "exa"] } };

function ref(name: string, level: string): RefMeta {
  return { name, description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level, filePath: `/p/${name}.md` };
}

const base: ApexContext = { sessionId: sid, framework: "react", filePath: "src/a.ts", content: "" };

test("docConsultedGate: block until Context7 + Exa consulted", () => {
  expect(docConsultedGate(base)?.kind).toBe("block");
  expect(docConsultedGate({ ...base, authorizations: consulted })).toBeNull();
});

test("solidReadGate: block until the required refs are read", () => {
  const refs = [ref("srp", "principle"), ref("tpl", "template")];
  const ctx = { ...base, authorizations: consulted, refs };
  const gate = solidReadGate(ctx);
  expect(gate?.kind).toBe("block");
  expect(gate?.actions?.length).toBe(2);
  expect(solidReadGate({ ...ctx, refsRead: gate?.actions })).toBeNull();
});

test("freshnessGate: blocks when prior agents are not fresh", () => {
  expect(evaluateApex({ ...base, agentsFresh: false })?.title).toContain("explore");
});

test("evaluateApex: chain — doc gate first, then solid, else allow", () => {
  const refs = [ref("srp", "principle"), ref("tpl", "template")];
  expect(evaluateApex(base)?.title).toContain("documentation");
  const docOk = { ...base, authorizations: consulted, refs };
  expect(evaluateApex(docOk)?.title).toContain("SOLID");
  expect(evaluateApex({ ...docOk, refsRead: ["/p/srp.md", "/p/tpl.md"] })).toBeNull();
});
