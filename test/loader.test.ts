import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toRefMeta, loadRefs } from "../src/refs/loader";
import { routeReferences } from "../src/refs/router";

test("toRefMeta: maps kebab + camel frontmatter keys", () => {
  const m = toRefMeta({ name: "srp", "applies-to": "**/*.tsx", "trigger-on-edit": "components/", level: "principle", keywords: "split" }, "/p/srp.md");
  expect(m.appliesTo).toBe("**/*.tsx");
  expect(m.triggerOnEdit).toBe("components/");
  expect(m.level).toBe("principle");
  expect(m.filePath).toBe("/p/srp.md");
});

test("loadRefs: scans recursively + routes by applies-to", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-refs-"));
  mkdirSync(join(dir, "templates"));
  writeFileSync(join(dir, "srp.md"), "---\nname: srp\nlevel: principle\napplies-to: **/*.tsx\n---\nbody");
  writeFileSync(join(dir, "templates", "comp.md"), "---\nname: comp\nlevel: template\napplies-to: **/*.tsx\n---\nbody");
  const refs = await loadRefs(dir);
  expect(refs.length).toBe(2);
  const routed = routeReferences(refs, "src/Button.tsx", "");
  expect(routed?.required.length).toBe(2);
});

test("loadRefs: missing dir -> empty", async () => {
  expect(await loadRefs(join(tmpdir(), "fh-nope-xyz"))).toEqual([]);
});
