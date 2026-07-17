import { test, expect, describe } from "bun:test";
import { goGate, rustGate } from "../src/policy/framework-solid-gates-systems";
import { reactGate, nextGate, laravelGate, swiftGate } from "../src/policy/framework-solid-gates";
import { moduleName, moduleAwarePath } from "../src/policy/module-layout";
import { isSelfGateSourcePath } from "../src/policy/framework-solid-exclude";
import { frameworkSolidGate } from "../src/policy/framework-solid";
import { resolveMaxLines } from "../src/config/limits";

// Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so the
// line-limit fixture below stays over the limit regardless of the ambient env
// override (repo convention — see test/burst-dedup.test.ts and friends).
const L = resolveMaxLines();

describe("module-layout: moduleName + moduleAwarePath", () => {
  test("moduleName extracts the segment after modules/", () => {
    expect(moduleName("/repo/modules/billing/src/services/invoice.ts")).toBe("billing");
    expect(moduleName("/repo/src/services/invoice.ts")).toBeUndefined();
  });

  test("moduleAwarePath nests subpath under the detected module, else falls back", () => {
    expect(moduleAwarePath("/repo/modules/billing/foo.ts", "interfaces/", "src/interfaces/")).toBe(
      "modules/billing/interfaces/",
    );
    expect(moduleAwarePath("/repo/src/foo.ts", "interfaces/", "src/interfaces/")).toBe("src/interfaces/");
  });
});

describe("goGate: real behavior on disk", () => {
  test("line limit uses moduleAwarePath when modules/<name>/ is present", () => {
    const long = Array.from({ length: L + 50 }, (_, i) => `var x${i} = ${i}`).join("\n");
    const v = goGate("/repo/modules/billing/store.go", long);
    expect(v.some((m) => m.includes("modules/billing/{services,handlers}.go"))).toBe(true);
  });

  test("interface co-located with its pointer-receiver implementation blocks", () => {
    const content = "type Store interface {\n\tGet() string\n}\n\nfunc (s *store) Get() string {\n\treturn \"\"\n}\n";
    const v = goGate("/repo/store.go", content);
    expect(v.some((m) => m.includes("Interface declared alongside its implementation"))).toBe(true);
  });

  test("interface alone (no co-located impl) does not block", () => {
    const content = "type Store interface {\n\tGet() string\n}\n";
    expect(goGate("/repo/store.go", content)).toEqual([]);
  });

  test("_test.go / mocks / interfaces paths are exempt from interface co-location", () => {
    const content = "type Store interface {\n\tGet() string\n}\n\nfunc (s *store) Get() string {\n\treturn \"\"\n}\n";
    expect(goGate("/repo/store_test.go", content)).toEqual([]);
    expect(goGate("/repo/mocks/store.go", content)).toEqual([]);
    expect(goGate("/repo/interfaces/store.go", content)).toEqual([]);
  });
});

describe("rustGate: real behavior on disk", () => {
  test("trait co-located with its impl blocks, moduleAwarePath used when detected", () => {
    const content = "trait Store {\n    fn get(&self) -> String;\n}\n\nimpl Store for MyStore {\n    fn get(&self) -> String { String::new() }\n}\n";
    const v = rustGate("/repo/modules/billing/store.rs", content);
    expect(v.some((m) => m.includes("modules/billing/traits.rs"))).toBe(true);
  });

  test("traits.rs / traits/ / interfaces/ paths are exempt from trait co-location", () => {
    const content = "trait Store {\n    fn get(&self) -> String;\n}\n\nimpl Store for MyStore {\n    fn get(&self) -> String { String::new() }\n}\n";
    expect(rustGate("/repo/traits.rs", content)).toEqual([]);
    expect(rustGate("/repo/traits/store.rs", content)).toEqual([]);
    expect(rustGate("/repo/interfaces/store.rs", content)).toEqual([]);
  });

  test("business logic in main.rs blocks, a bare clap Args struct does not", () => {
    const withLogic = "struct Config {\n    name: String,\n}\n\nimpl Config {\n    fn new() -> Self { Config { name: String::new() } }\n}\n";
    expect(rustGate("/repo/main.rs", withLogic).some((m) => m.includes("Entry point contains business logic"))).toBe(true);

    const clapOnly = "#[derive(Parser)]\nstruct Args {\n    name: String,\n}\n";
    expect(rustGate("/repo/main.rs", clapOnly).some((m) => m.includes("Entry point contains business logic"))).toBe(false);
  });

  test("unsafe without a // SAFETY: comment blocks; with one, it passes", () => {
    const noSafety = "fn write_raw() {\n    unsafe {\n        std::ptr::null::<u8>();\n    }\n}\n";
    expect(rustGate("/repo/lib.rs", noSafety).some((m) => m.includes("// SAFETY:"))).toBe(true);

    const withSafety = "fn write_raw() {\n    // SAFETY: pointer is valid and aligned\n    unsafe {\n        std::ptr::null::<u8>();\n    }\n}\n";
    expect(rustGate("/repo/lib.rs", withSafety).some((m) => m.includes("// SAFETY:"))).toBe(false);
  });
});

describe("P2: ts/next/laravel/swift gates are module-aware", () => {
  test("reactGate: modules/<name>/ present -> modules/<name>/src/interfaces/, else static fallback", () => {
    const content = "export interface Foo {\n  bar: string;\n}\n";
    const inModule = reactGate("/repo/modules/billing/components/Foo.tsx", content);
    expect(inModule.some((m) => m.includes("modules/billing/src/interfaces/"))).toBe(true);

    const noModule = reactGate("/repo/src/components/Foo.tsx", content);
    expect(noModule.some((m) => m.includes("src/interfaces/ or src/types/"))).toBe(true);
  });

  test("nextGate: modules/<name>/ present -> modules/<name>/src/interfaces/, else plain src/interfaces/", () => {
    const content = "export interface Foo {\n  bar: string;\n}\n";
    const inModule = nextGate("/repo/modules/billing/app/Foo.tsx", content);
    expect(inModule.some((m) => m.includes("modules/billing/src/interfaces/"))).toBe(true);

    const noModule = nextGate("/repo/app/Foo.tsx", content);
    expect(noModule.some((m) => m.includes("Move to src/interfaces/."))).toBe(true);
  });

  test("laravelGate: modules/<name>/ present -> modules/<name>/Contracts/, else FuseCore fallback", () => {
    const content = "interface FooInterface {\n}\n";
    const inModule = laravelGate("/repo/modules/billing/Foo.php", content);
    expect(inModule.some((m) => m.includes("modules/billing/Contracts/"))).toBe(true);

    const noModule = laravelGate("/repo/app/Foo.php", content);
    expect(noModule.some((m) => m.includes("app/Contracts/ or FuseCore/{Module}/App/Contracts/"))).toBe(true);
  });

  test("swiftGate: modules/<name>/ present -> modules/<name>/Protocols/, else Protocols/ directory fallback", () => {
    const content = "protocol Foo {\n}\n";
    const inModule = swiftGate("/repo/modules/billing/Foo.swift", content);
    expect(inModule.some((m) => m.includes("modules/billing/Protocols/"))).toBe(true);

    const noModule = swiftGate("/repo/Sources/Foo.swift", content);
    expect(noModule.some((m) => m.includes("Move to Protocols/ directory."))).toBe(true);
  });
});

describe("P1: self-gate exemption", () => {
  test("isSelfGateSourcePath matches the 2 gate-source files, nothing else", () => {
    expect(isSelfGateSourcePath("/x/src/policy/framework-solid-gates.ts")).toBe(true);
    expect(isSelfGateSourcePath("/x/src/policy/framework-solid-gates-systems.ts")).toBe(true);
    expect(isSelfGateSourcePath("/x/src/policy/framework-solid.ts")).toBe(false);
    expect(isSelfGateSourcePath("/x/src/policy/guards/interface-separation.ts")).toBe(false);
    expect(isSelfGateSourcePath("/x/src/components/Foo.tsx")).toBe(false);
  });

  test("frameworkSolidGate no longer self-blocks on the real gate-source file content", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const p = resolve(import.meta.dir, "../src/policy/framework-solid-gates.ts");
    const content = readFileSync(p, "utf8");
    expect(frameworkSolidGate(p, content)).toBeNull();
  });

  test("the fix does not weaken real detection: an actual .tsx component with a top-level interface still blocks", () => {
    const content = "export interface FooProps {\n  bar: string;\n}\n";
    const g = frameworkSolidGate("/repo/src/components/Foo.tsx", content);
    expect(g).not.toBeNull();
    expect(g?.reason).toContain("Interface/type in component");
  });
});
