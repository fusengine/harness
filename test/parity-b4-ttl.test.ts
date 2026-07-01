import { test, expect } from "bun:test";
import { solidReadGate, type ApexContext } from "../src/policy/apex";
import { emptyTrack, recordRefRead } from "../src/tracking/session-state";
import type { RefMeta } from "../src/refs/types";

// Parity B4 (TTL): require-solid-read.py::_check_solid_read re-validates
// FUSE_ENFORCE_TTL_SEC (default 120s) on EVERY edit — a SOLID read expires
// after the window. Python TTL-izes ONLY SOLID reads (track-solid-reads.py
// timestamps them); skill-trigger/design/shadcn reads stay session-scoped.

const NOW = 1_750_000_000_000;
const WINDOW_MS = 120_000;
const P0 = "/skills/solid-react/references/srp.md";
const P1 = "/skills/solid-react/references/tpl.md";

/** Minimal RefMeta routed for any .ts edit (mirrors test/apex.test.ts). */
function mkRef(name: string, level: string): RefMeta {
  return { name, description: "", keywords: "", priority: "", related: "", appliesTo: "**/*.ts", triggerOnEdit: "", level, filePath: `/skills/solid-react/references/${name}.md` };
}

const base: ApexContext = {
  sessionId: "s1",
  framework: "react",
  filePath: "src/a.ts",
  content: "",
  refs: [mkRef("srp", "principle"), mkRef("tpl", "template")],
  refsRead: [P0, P1],
  windowMs: WINDOW_MS,
  now: NOW,
};

test("solidReadGate TTL: fresh reads within windowMs -> allow", () => {
  expect(solidReadGate({ ...base, refsReadAt: { [P0]: NOW - 10_000, [P1]: NOW - WINDOW_MS + 1 } })).toBeNull();
});

test("solidReadGate TTL: reads beyond windowMs -> block again (strict `<`, parity _check_solid_read)", () => {
  // Exactly windowMs old is already expired — Python uses `elapsed < TTL`.
  const gate = solidReadGate({ ...base, refsReadAt: { [P0]: NOW - WINDOW_MS, [P1]: NOW - WINDOW_MS - 5_000 } });
  expect(gate?.kind).toBe("block");
  expect(gate?.actions).toEqual([P0, P1]);
});

test("solidReadGate TTL: one fresh + one stale -> block listing only the stale ref", () => {
  const gate = solidReadGate({ ...base, refsReadAt: { [P0]: NOW - 1_000, [P1]: NOW - WINDOW_MS - 1 } });
  expect(gate?.kind).toBe("block");
  expect(gate?.actions).toEqual([P1]);
});

test("solidReadGate TTL: refsRead without refsReadAt stamps -> allow (pre-TTL tracks, compat)", () => {
  expect(solidReadGate({ ...base, refsReadAt: undefined })).toBeNull();
  // Partial stamps: an unstamped path still counts as read; a fresh stamp passes.
  expect(solidReadGate({ ...base, refsReadAt: { [P0]: NOW - 1 } })).toBeNull();
});

test("solidReadGate TTL: no clock (ctx.now absent) -> reads never expire (pre-wiring contexts)", () => {
  const stale = { [P0]: NOW - WINDOW_MS * 10, [P1]: NOW - WINDOW_MS * 10 };
  expect(solidReadGate({ ...base, now: undefined, refsReadAt: stale })).toBeNull();
});

test("solidReadGate TTL: the parent SKILL.md read is TTL'd too (fresh satisfies, stale re-blocks)", () => {
  const skill = "/skills/solid-react/SKILL.md";
  const ctx = { ...base, refsRead: [skill] };
  expect(solidReadGate({ ...ctx, refsReadAt: { [skill]: NOW - 1_000 } })).toBeNull();
  expect(solidReadGate({ ...ctx, refsReadAt: { [skill]: NOW - WINDOW_MS } })?.kind).toBe("block");
});

test("recordRefRead: stamps refsReadAt when `now` is supplied and refreshes on re-read", () => {
  const t1 = recordRefRead(emptyTrack(), P0, NOW - 60_000);
  expect(t1.refsRead).toEqual([P0]);
  expect(t1.refsReadAt).toEqual({ [P0]: NOW - 60_000 });
  // Re-read refreshes the stamp without duplicating the path (newest read wins,
  // like Python's reversed() scan over appended solid_reads entries).
  const t2 = recordRefRead(t1, P0, NOW);
  expect(t2.refsRead).toEqual([P0]);
  expect(t2.refsReadAt).toEqual({ [P0]: NOW });
});

test("recordRefRead: legacy call without `now` keeps the untimestamped shape", () => {
  const t = recordRefRead(emptyTrack(), P0);
  expect(t.refsRead).toEqual([P0]);
  expect(t.refsReadAt).toBeUndefined();
});
