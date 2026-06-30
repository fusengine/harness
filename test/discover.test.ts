import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { discoverRefs } from "../src/refs/discover";

/** mkdir -p join(parts) and return the path. */
function mk(...parts: string[]): string {
  const p = join(...parts);
  mkdirSync(p, { recursive: true });
  return p;
}

test("discoverRefs: allowlisted marketplace + standalone solid-* refs, deduped, empty when none", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "fh-cwd-"));

  // Nothing yet → disabled (empty string).
  expect(discoverRefs(home, cwd, ["m"])).toBe("");

  const projRefs = mk(cwd, ".claude", "skills", "solid-react", "references"); // Claude project (always scanned)
  const agentsRefs = mk(cwd, ".agents", "skills", "solid-go", "references"); // Codex project (always scanned)
  const mktRefs = mk(home, ".claude", "plugins", "marketplaces", "m", "plugins", "p", "skills", "solid-php", "references"); // allowlisted marketplace
  const otherRefs = mk(home, ".claude", "plugins", "marketplaces", "other", "plugins", "q", "skills", "solid-rust", "references"); // NOT allowlisted
  mk(cwd, ".claude", "skills", "shadcn-components", "references"); // non-solid → ignored
  mk(home, ".claude", "plugins", "cache", "m", "p", "1.0.0", "skills", "solid-react", "references"); // version-cache dup of solid-react

  const got = discoverRefs(home, cwd, ["m"]).split(delimiter);
  expect(got).toContain(projRefs);
  expect(got).toContain(agentsRefs);
  expect(got).toContain(mktRefs);
  expect(got).not.toContain(otherRefs); // marketplace "other" excluded by the allowlist
  expect(got.some((d) => d.includes("shadcn-components"))).toBe(false); // non-solid excluded
  expect(got.filter((d) => d.includes("solid-react")).length).toBe(1); // deduped by skill name (project wins)
});
