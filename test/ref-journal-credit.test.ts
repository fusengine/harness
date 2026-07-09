import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { appendRefRead, reconcileRefReadsFromJournal } from "../src/freshness/ref-journal";
import { solidReadGate, type ApexContext } from "../src/policy/apex";
import { emptyTrack } from "../src/tracking/session-state";
import type { RefMeta } from "../src/refs/types";

const NOW = Date.now();
const MARKET_REQ =
  "/Users/x/.claude/plugins/marketplaces/fusengine-plugins/plugins/solid/skills/solid-generic/references/architecture-patterns.md";
const CACHE_REQ =
  "/Users/x/.claude/plugins/cache/fusengine-plugins/fuse-solid/1.0.12/skills/solid-generic/references/architecture-patterns.md";
const ref: RefMeta = { name: "arch", description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level: "principle", filePath: MARKET_REQ };
const base: ApexContext = { sessionId: "s", framework: "generic", filePath: "src/a.ts", content: "", refs: [ref], now: NOW, windowMs: 120_000 };

/** A fresh, empty per-session state dir. */
function stateDir(): string {
  return mkdtempSync(join(tmpdir(), "journal-credit-"));
}

test("journalled read of the version-cache equivalent path credits the marketplace-required ref", () => {
  const dir = stateDir();
  expect(solidReadGate({ ...base, refsRead: [], refsReadAt: {} })?.kind).toBe("block");
  appendRefRead(dir, CACHE_REQ, NOW - 5_000);
  const track = reconcileRefReadsFromJournal(emptyTrack(), dir, NOW);
  expect(solidReadGate({ ...base, refsRead: track.refsRead, refsReadAt: track.refsReadAt })).toBeNull();
});

test("journalled read of a forged /tmp/skills/... path does NOT credit — still blocks", () => {
  const dir = stateDir();
  const forged = "/tmp/skills/solid-generic/references/architecture-patterns.md";
  appendRefRead(dir, forged, NOW - 5_000);
  const track = reconcileRefReadsFromJournal(emptyTrack(), dir, NOW);
  expect(solidReadGate({ ...base, refsRead: track.refsRead, refsReadAt: track.refsReadAt })?.kind).toBe("block");
});
