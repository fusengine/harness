import { test, expect } from "bun:test";
import { maskCommentsAndStrings } from "../src/policy/conventions/strip";
import { declaresInterface } from "../src/policy/conventions/interfaces";

// D0.1 (external audit): an unmatched quote must not swallow the rest of the
// file — a JSX apostrophe opens no string, an unpaired backtick masks nothing.
test("D0.1: JSX apostrophe (Don't) does not hide a trailing real interface", () => {
  const src = "export const B = () => <p>Don't panic</p>;\nexport interface Props { x: number }";
  const masked = maskCommentsAndStrings(src, "c");
  expect(masked).toContain("export interface Props");
  expect(declaresInterface("/p/B.tsx", src)).toBe(true);
});

test("D0.1: unterminated backtick masks nothing past it", () => {
  const src = "const tpl = `unclosed\nexport interface Props { x: number }";
  const masked = maskCommentsAndStrings(src, "c");
  expect(masked).toContain("export interface Props");
  expect(declaresInterface("/p/B.tsx", src)).toBe(true);
});

test("D0.1: legitimate FP kills stay allow (comment, paired template, heredoc)", () => {
  expect(maskCommentsAndStrings("// export interface Fake {\nx = 1;", "c")).not.toContain("export interface Fake");
  const tpl = "const F = `\nexport interface Fake {\n`;\nexport const a = 1;";
  expect(maskCommentsAndStrings(tpl, "c")).not.toContain("export interface Fake");
  const php = "<?php\n$s = <<<EOT\ninterface Hidden {}\nEOT;\ninterface Real {}";
  const maskedPhp = maskCommentsAndStrings(php, "php");
  expect(maskedPhp).not.toContain("interface Hidden");
  expect(maskedPhp).toContain("interface Real");
});
