import { test, expect } from "bun:test";
import { maskCommentsAndStrings } from "../src/policy/conventions/strip";

test("mask: line comments blanked, code kept, line count preserved", () => {
  const src = "const a = 1;\n// interface Fake {\nconst b = 2;\n";
  const masked = maskCommentsAndStrings(src, "c");
  expect(masked).toContain("const a = 1;");
  expect(masked).not.toContain("interface Fake");
  expect(masked.split("\n").length).toBe(src.split("\n").length);
});

test("mask: block comments (multiline) blanked, anchors stay valid", () => {
  const src = "/*\ninterface Hidden {\n*/\nexport interface Real {";
  const masked = maskCommentsAndStrings(src, "c");
  expect(masked).not.toContain("interface Hidden");
  expect(masked).toContain("export interface Real");
});

test("mask: template literals and strings blanked (fixture FP)", () => {
  const src = "const FIXTURE = `\ninterface ButtonProps {\n`;\nexport const ok = 1;";
  const masked = maskCommentsAndStrings(src, "c");
  expect(masked).not.toContain("interface ButtonProps");
  expect(masked).toContain("export const ok = 1;");
});

test("mask: escaped quotes do not end the string early", () => {
  const src = 'const s = "a \\" still string";\ninterface Real {';
  const masked = maskCommentsAndStrings(src, "c");
  expect(masked).toContain("interface Real");
  expect(masked.split("\n")[0]).not.toContain("still string");
});

test("mask: python # comments and triple-quoted strings blanked", () => {
  const src = "# class Fake(ABC):\nx = 1\n'''\nclass Hidden(ABC):\n'''\nclass Real(ABC):";
  const masked = maskCommentsAndStrings(src, "py");
  expect(masked).not.toContain("class Fake");
  expect(masked).not.toContain("class Hidden");
  expect(masked).toContain("class Real(ABC):");
});

test("mask: php heredoc blanked, // and # comments blanked", () => {
  const src = "<?php\n$s = <<<EOT\ninterface Hidden {}\nEOT;\n// interface Also {}\ninterface Real {}";
  const masked = maskCommentsAndStrings(src, "php");
  expect(masked).not.toContain("interface Hidden");
  expect(masked).not.toContain("interface Also");
  expect(masked).toContain("interface Real");
});
