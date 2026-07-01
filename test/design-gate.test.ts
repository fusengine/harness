import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { designGate } from "../src/runtime/design";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { loadDesignState } from "../src/policy/design/state";
import type { NormalizedEvent } from "../src/runtime/normalize";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-dg-"));
const ev = (e: NormalizedEvent): NormalizedEvent => e;

test("designGate: UI .tsx write blocked when no skill/doc evidence (ports check-design-skill)", () => {
  const cache = tmp();
  const e = ev({ phase: "pre", tool: "Write", input: {}, sessionId: "no-ev", filePath: "src/components/Hero.tsx", content: 'className="flex"' });
  const p = designGate({}, e, cache, "/proj");
  expect(p?.kind).toBe("block");
  expect(p?.title).toBe("Design skill");
});

test("designGate P5: active flag + missing state auto-inits instead of fail-open null", () => {
  const cache = tmp();
  setActiveDesignAgent(cache, "agX");
  // A fuse-browser navigate at phase 0, from the active design agent itself, must be gated.
  const e = ev({ phase: "pre", tool: "mcp__fuse-browser__browser_navigate", input: { url: "https://example.com" }, sessionId: "s5", filePath: undefined, content: undefined });
  const p = designGate({ agent_id: "agX" }, e, cache, "/proj");
  expect(p?.kind).toBe("block");
  expect(loadDesignState(cache, "agX")).not.toBeNull();
});

test("designGate: top-level call without agent_id is never design-scoped, even with a stale active flag", () => {
  const cache = tmp();
  setActiveDesignAgent(cache, "agX");
  const e = ev({ phase: "pre", tool: "mcp__fuse-browser__browser_navigate", input: { url: "https://example.com" }, sessionId: "s5b", filePath: undefined, content: undefined });
  expect(designGate({}, e, cache, "/proj")).toBeNull();
});

test("designGate: no flag + non-UI tool stays inert (null)", () => {
  const cache = tmp();
  const e = ev({ phase: "pre", tool: "mcp__fuse-browser__browser_navigate", input: { url: "https://example.com" }, sessionId: "s6", filePath: undefined, content: undefined });
  expect(designGate({}, e, cache, "/proj")).toBeNull();
});
