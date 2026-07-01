import { test, expect } from "bun:test";
import { interfaceSeparationGuard, PY_MODEL_RE } from "../src/policy/guards/interface-separation";

// Parity-batch3 (interfacesep) — E2 false negative fix.
// PY_MODEL_RE must mirror enforce-interfaces.py:10's permissive
// `^class [A-Z].*(BaseModel|TypedDict|Protocol)`, which also matches MULTIPLE
// inheritance (`class Foo(Base, BaseModel)`). The pre-fix regex
// `/^\s*class\s+\w+\((BaseModel|TypedDict|Protocol)\)/` required a single direct
// base and silently missed multi-base classes. These lock the after-fix behavior.

const py = (content: string, path = "app/views/home.py") =>
  interfaceSeparationGuard({ tool: "Write", filePath: path, content });

test("PY_MODEL_RE now matches multiple inheritance (was a false negative)", () => {
  // Extra base(s) BEFORE the target base — the exact case the old regex missed.
  expect(PY_MODEL_RE.test("class HomeView(Base, BaseModel):\n    pass\n")).toBe(true);
  expect(PY_MODEL_RE.test("class Cfg(Mixin, TypedDict):\n")).toBe(true);
  expect(PY_MODEL_RE.test("class P(A, B, Protocol):\n")).toBe(true);
  // Target first, extra base(s) AFTER it, is covered too.
  expect(PY_MODEL_RE.test("class Foo(BaseModel, Mixin):\n")).toBe(true);
});

test("single direct inheritance still matches (regression guard)", () => {
  expect(PY_MODEL_RE.test("class HomeView(BaseModel):\n")).toBe(true);
  expect(PY_MODEL_RE.test("class Cfg(TypedDict):\n")).toBe(true);
  expect(PY_MODEL_RE.test("class Proto(Protocol):\n")).toBe(true);
});

test("guard blocks a multiple-inheritance model class in a Python view file", () => {
  expect(py("class HomeView(BaseMixin, BaseModel):\n    pass\n")?.kind).toBe("block");
  expect(py("class Payload(Mixin, TypedDict):\n")?.kind).toBe("block");
});

test("word boundaries keep it precise: no MyBaseModel, no trailing comment", () => {
  // `MyBaseModel` is a user base, not pydantic's BaseModel — must NOT fire.
  expect(PY_MODEL_RE.test("class Foo(MyBaseModel):\n")).toBe(false);
  // Target name only in a comment past the closing paren — must NOT fire.
  expect(PY_MODEL_RE.test("class Foo(object):  # BaseModel\n")).toBe(false);
  expect(py("class Foo(MyBaseModel):\n")).toBeNull();
});
