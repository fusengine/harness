import { test, expect } from "bun:test";
import { parseVersions, countNew } from "../src/changelog/fetch";

const MDX = [
  "# Claude Code changelog",
  '<Update label="1.4.0" description="June 26, 2026">',
  "  * feature",
  "</Update>",
  '<Update label="1.3.2" description="June 25, 2026">',
  "  * fix",
  "</Update>",
  "## v1.3.1",          // legacy header fallback still parsed
  "not a header ## 9.9.9",
].join("\n");

test("parseVersions: extracts MDX `<Update label>` + legacy `##` headers, skips inline", () => {
  expect(parseVersions(MDX)).toEqual(["1.4.0", "1.3.2", "1.3.1"]);
  expect(parseVersions("no versions here")).toEqual([]);
});

test("countNew: counts versions newer than the last known", () => {
  const versions = ["1.4.0", "1.3.2", "1.3.1"];
  expect(countNew(versions, "1.3.2")).toBe(1); // only 1.4.0 is new
  expect(countNew(versions, "1.4.0")).toBe(0); // up to date
  expect(countNew(versions, "")).toBe(0);      // no baseline
  expect(countNew(versions, "0.9.0")).toBe(3); // unknown baseline → all new
});
