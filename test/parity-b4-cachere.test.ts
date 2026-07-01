import { test, expect } from "bun:test";
import { classifyExplore } from "../src/freshness/explore-tools";

// B4-cachere — CACHE_READ_RE (explore-tools.ts) only matched the Python-era
// cache names (`<session>/context/mcp/context7-*.md`), which the TS store no
// longer produces: the core MCP store writes `<root>/.harness/cache/<fnv16>.md`
// (cache/store.ts `cachePath`) and the ai-pilot doc caches write
// `~/.fuse-harness/cache/<type>/<projectHash>/**/*.md` (aipilot/cache-base.ts).
// A Read of a real TS cache file was therefore never credited as
// research-expert, contradicting the SubagentStart injection announcement
// (subagent-cache.ts: "Read sur cache MCP compte comme research-expert").

test("classifyExplore: Read of a core MCP cache entry (.harness/cache/<fnv16>.md) credits research", () => {
  expect(classifyExplore("Read", { file_path: "/proj/.harness/cache/ab12cd340000002a.md" })).toEqual({
    phase: "research-expert",
    cacheHit: true,
  });
});

test("classifyExplore: Read of an ai-pilot doc cache under ~/.fuse-harness/cache credits research", () => {
  // Absolute home path (doc cache: cache/doc/<projectHash>/docs/<hash>.md).
  expect(classifyExplore("Read", { file_path: "/Users/u/.fuse-harness/cache/doc/1234abcd5678ef90/docs/aa.md" })).toEqual({
    phase: "research-expert",
    cacheHit: true,
  });
  // Tilde-prefixed path — segment match, not homedir-resolved.
  expect(classifyExplore("Read", { file_path: "~/.fuse-harness/cache/deadbeef00000010.md" })).toEqual({
    phase: "research-expert",
    cacheHit: true,
  });
});

test("classifyExplore: legacy Python cache names remain credited", () => {
  expect(classifyExplore("Read", { file_path: "/s/context/mcp/context7-react-hooks.md" })).toEqual({
    phase: "research-expert",
    cacheHit: true,
  });
  expect(classifyExplore("Read", { file_path: "/s/context/mcp/exa-search-abc.md" })).toEqual({
    phase: "research-expert",
    cacheHit: true,
  });
});

test("classifyExplore: paths outside a cache tree are NOT credited as research", () => {
  // Plain repo markdown (stays a `ref` in activityFor, not research).
  expect(classifyExplore("Read", { file_path: "/proj/refs/srp.md" })).toBeNull();
  // Session-state JSON under the cache base — not a cached `.md` doc.
  expect(classifyExplore("Read", { file_path: "/Users/u/.fuse-harness/cache/sessions/s1/state.json" })).toBeNull();
  // `harness/cache` without the dot segment is NOT the state dir.
  expect(classifyExplore("Read", { file_path: "/proj/harness/cache/readme.md" })).toBeNull();
});
