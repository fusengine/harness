import { test, expect } from "bun:test";
import { declaresInterface, declaresExportedTypeAlias } from "../src/policy/conventions/interfaces";

test("ts: exported interface matches; local, alias, comment and string do not", () => {
  expect(declaresInterface("/p/a.ts", "export interface User {\n  id: string;\n}")).toBe(true);
  expect(declaresInterface("/p/a.ts", "export declare interface Global {\n  x: number;\n}")).toBe(true);
  expect(declaresInterface("/p/a.ts", "interface Local {\n  x: number;\n}")).toBe(false); // non-exported = allowed
  expect(declaresInterface("/p/a.tsx", "// export interface Fake {\nexport const a = 1;")).toBe(false);
  expect(declaresInterface("/p/a.tsx", "export type Row = { id: string };")).toBe(false); // alias is not an interface
});

test("ts aliases: exported alias matches; local alias and comment do not", () => {
  expect(declaresExportedTypeAlias("export type Row = { id: string };")).toBe(true);
  expect(declaresExportedTypeAlias("type Local = string;")).toBe(false);
  expect(declaresExportedTypeAlias("// export type Fake = string;")).toBe(false);
});

test("py: ABC/ABCMeta/Protocol anchored; ABCParser and comments rejected", () => {
  expect(declaresInterface("/p/a.py", "class Repo(ABC):\n    pass")).toBe(true);
  expect(declaresInterface("/p/a.py", "class Repo(metaclass=ABCMeta):\n    pass")).toBe(true);
  expect(declaresInterface("/p/a.py", "class Proto(Protocol):\n    pass")).toBe(true);
  expect(declaresInterface("/p/a.py", "class ABCParser:\n    pass")).toBe(false);
  expect(declaresInterface("/p/a.py", "# class Repo(ABC):\nx = 1")).toBe(false);
});

test("go: exported and unexported, brace optional; comments rejected", () => {
  expect(declaresInterface("/p/a.go", "type Store interface {\n\tGet() string\n}")).toBe(true);
  expect(declaresInterface("/p/a.go", "type store interface {\n\tGet() string\n}")).toBe(true);
  expect(declaresInterface("/p/a.go", "// type Fake interface {\npackage main")).toBe(false);
  expect(declaresInterface("/p/a.go", "type Store struct {\n\tx int\n}")).toBe(false);
});

test("rust/java/swift/php: common idioms incl. modifiers", () => {
  expect(declaresInterface("/p/a.rs", "pub trait Store {\n    fn get(&self);\n}")).toBe(true);
  expect(declaresInterface("/p/a.rs", "trait Store {\n    fn get(&self);\n}")).toBe(true);
  expect(declaresInterface("/p/A.java", "public interface Repo {\n}")).toBe(true);
  expect(declaresInterface("/p/A.java", "sealed interface Repo {\n}")).toBe(true);
  expect(declaresInterface("/p/A.kt", "fun interface Repo {\n}")).toBe(true);
  expect(declaresInterface("/p/A.swift", "public protocol Store {\n}")).toBe(true);
  expect(declaresInterface("/p/A.swift", "protocol Store {\n}")).toBe(true);
  expect(declaresInterface("/p/a.php", "interface Repo {\n}")).toBe(true);
  expect(declaresInterface("/p/a.php", "abstract class Base {\n}")).toBe(true);
  expect(declaresInterface("/p/a.php", "class PaymentRequestHandler {\n}")).toBe(false); // old .* traversal FP
});
