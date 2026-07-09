import { test, expect } from "bun:test";
import { skillRefKey } from "../src/refs/ref-key";

const MARKET =
  "/Users/x/.claude/plugins/marketplaces/fusengine-plugins/plugins/solid/skills/solid-react/references/srp.md";
const CACHE =
  "/Users/x/.claude/plugins/cache/fusengine-plugins/fuse-solid/1.0.12/skills/solid-react/references/srp.md";

test("marketplace and version-cache paths for the same skill normalize to the same key", () => {
  expect(skillRefKey(MARKET)).toBe("skills/solid-react/references/srp.md");
  expect(skillRefKey(MARKET)).toBe(skillRefKey(CACHE));
});

test("standalone .cursor and /etc/codex skill roots are recognized", () => {
  expect(skillRefKey("/home/u/project/.cursor/skills/solid-react/references/srp.md")).toBe(
    "skills/solid-react/references/srp.md",
  );
  expect(skillRefKey("/etc/codex/skills/solid-react/references/srp.md")).toBe(
    "skills/solid-react/references/srp.md",
  );
});

test("a forged path with the right suffix but no recognized root returns null", () => {
  expect(skillRefKey("/tmp/skills/solid-react/references/srp.md")).toBeNull();
});

test("a deep forgery reusing the cache/marketplace shape without the .claude/.codex/.cursor/.agents root returns null", () => {
  expect(skillRefKey("/tmp/plugins/cache/fake/fake/fake/skills/solid-react/references/srp.md")).toBeNull();
  expect(
    skillRefKey("/tmp/plugins/marketplaces/fake/plugins/fake/skills/solid-react/references/srp.md"),
  ).toBeNull();
  expect(skillRefKey("/home/attacker/etc/codex/skills/solid-react/references/srp.md")).toBeNull();
});

test("a path with no skills/ segment returns null", () => {
  expect(
    skillRefKey("/plugins/marketplaces/fusengine-plugins/plugins/solid/references/srp.md"),
  ).toBeNull();
});
