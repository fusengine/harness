import { test, expect } from "bun:test";
import { interfaceSeparationGuard } from "../src/policy/guards/interface-separation";

test("blocks top-level interface in a .tsx component", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/components/Button.tsx", content: "export interface ButtonProps {\n  label: string;\n}\n" })?.kind).toBe("block");
});

test("blocks abstract class in a PHP controller", () => {
  expect(interfaceSeparationGuard({ tool: "Edit", filePath: "app/Http/Controllers/UserController.php", content: "<?php\nabstract class BaseController {}\n" })?.kind).toBe("block");
});

test("null without a top-level decl, on path/content mismatch, and non Write/Edit", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/components/Button.tsx", content: "export function Button() { return null; }\n" })).toBeNull();
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "app/Http/Controllers/U.php", content: "export interface Foo { a: number }\n" })).toBeNull();
  expect(interfaceSeparationGuard({ tool: "Read", filePath: "src/components/Button.tsx", content: "export interface P { a: number }\n" })).toBeNull();
});
