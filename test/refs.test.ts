import { test, expect } from "bun:test";
import { parseFrontmatter, globToRe } from "../src/refs/frontmatter";
import { routeReferences, scoreReferences } from "../src/refs/router";
import type { RefMeta } from "../src/refs/types";

function ref(name: string, level: string, appliesTo = "**/*.ts"): RefMeta {
  return { name, description: "", keywords: "", priority: "", related: "", appliesTo, triggerOnEdit: "", level, filePath: `/p/${name}.md` };
}

test("parseFrontmatter: pairs, quotes stripped, none", () => {
  const fm = parseFrontmatter('---\nname: foo\nlevel: "principle"\n---\nbody');
  expect(fm.name).toBe("foo");
  expect(fm.level).toBe("principle");
  expect(parseFrontmatter("no frontmatter")).toEqual({});
});

test("globToRe: ** and *", () => {
  expect(globToRe("**/*.ts").test("src/a/b.ts")).toBe(true);
  expect(globToRe("*.ts").test("a.ts")).toBe(true);
  expect(globToRe("*.ts").test("a/b.ts")).toBe(false);
});

test("scoreReferences + routeReferences", () => {
  const refs = [ref("srp", "principle"), ref("tpl", "template")];
  expect(scoreReferences(refs, "src/x.ts", "").length).toBe(2);
  const r = routeReferences(refs, "src/x.ts", "", "/p/SKILL.md");
  expect(r).not.toBeNull();
  expect(r?.required.length).toBe(2);
  expect(r?.skillPath).toBe("/p/SKILL.md");
  expect(routeReferences([], "x", "")).toBeNull();
  expect(routeReferences([ref("z", "architecture", "**/*.py")], "x.ts", "")).toBeNull();
});

test("routeReferences: skillPath derivation vs explicit override", () => {
  // Real on-disk skill layout: <skill>/references/<file>.md
  const onDisk: RefMeta = { ...ref("srp", "principle"), filePath: "/skills/solid-react/references/srp.md" };
  // 3-arg call (as solidReadGate does in production): derive <skill>/SKILL.md from the ref path.
  expect(routeReferences([onDisk], "src/x.ts", "")?.skillPath).toBe("/skills/solid-react/SKILL.md");
  // Explicit 4th arg wins over derivation, even when derivation would yield a non-empty path.
  expect(routeReferences([onDisk], "src/x.ts", "", "/explicit/SKILL.md")?.skillPath).toBe("/explicit/SKILL.md");
  // Ad-hoc path without a "/references/" segment → "" (no regression).
  expect(routeReferences([ref("srp", "principle")], "src/x.ts", "")?.skillPath).toBe("");
});
