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
