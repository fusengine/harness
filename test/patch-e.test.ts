import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameworkSolidGate } from "../src/policy/framework-solid";
import { interfaceSeparationGuard } from "../src/policy/guards/interface-separation";
import { countFrameworkCodeLines } from "../src/policy/file-size";

function run<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; }
  }
}
const ADV = { FUSE_CONVENTIONS_MODE: "advisory", FUSE_SOLID_MAX_LINES: "100" } as const;
const DENY = { FUSE_CONVENTIONS_MODE: "deny", FUSE_SOLID_MAX_LINES: "100" } as const;

function project(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fh-e5-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  return dir;
}

test("E1 store location: advisory default, deny on flag (zustand curried, no import needed)", () => {
  const src = "export const useAuthStore = create<Auth>()((set) => ({}));\n";
  const a = run(ADV, () => frameworkSolidGate("/p/modules/u/src/auth.ts", src));
  expect(a?.kind).toBe("inform");
  expect(a?.reason).toContain("src/stores/");
  expect(run(DENY, () => frameworkSolidGate("/p/modules/u/src/auth.ts", src))?.kind).toBe("block");
  expect(run(ADV, () => frameworkSolidGate("/p/modules/u/src/stores/auth.store.ts", src))).toBeNull();
});

test("E1 store budget: FUSE_SOLID_MAX_LINES=80 → limit 32 in the gate message", () => {
  const src = Array.from({ length: 34 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\nexport const useS = create<S>()((set) => ({}));";
  expect(countFrameworkCodeLines(src)).toBeGreaterThan(32);
  const p = run({ FUSE_CONVENTIONS_MODE: "advisory", FUSE_SOLID_MAX_LINES: "80" }, () => frameworkSolidGate("/p/modules/u/src/stores/s.store.ts", src));
  expect(p?.reason).toContain("(limit: 32)");
});

test("E1 store FP: Object.create and home-made factory stay silent", () => {
  expect(run(ADV, () => frameworkSolidGate("/p/modules/u/src/factory.ts", "export const obj = Object.create(null);"))).toBeNull();
  expect(run(ADV, () => frameworkSolidGate("/p/modules/u/src/factory.ts", "export const w = create(() => ({ render() {} }));"))).toBeNull();
});

test("E1 query: cap-gated — advisory with the dep, silent without; query/ and hooks/ allowed", () => {
  const withQuery = project({ react: "19", "@tanstack/react-query": "5" });
  const src = "import { useQuery } from '@tanstack/react-query';\nexport const useUsers = () => useQuery({ queryKey: ['u'] });";
  const a = run(ADV, () => frameworkSolidGate(join(withQuery, "modules/u/components/Users.tsx"), src));
  expect(a?.kind).toBe("inform");
  expect(a?.reason).toContain("src/query/");
  // F0.2: without the dep the query exemption is OFF — the legacy hook rule hard-denies.
  const without = project({ react: "19" });
  const legacyBlock = run(ADV, () => frameworkSolidGate(join(without, "modules/u/components/Users.tsx"), src));
  expect(legacyBlock?.kind).toBe("block");
  expect(legacyBlock?.reason).toContain("Move to hooks/.");
  expect(run(ADV, () => frameworkSolidGate(join(withQuery, "modules/u/src/query/users.ts"), src))).toBeNull();
  expect(run(ADV, () => frameworkSolidGate(join(withQuery, "modules/u/src/hooks/useUsers.ts"), src))).toBeNull();
});

test("E2 components: component in src/stores|hooks → advisory; in components/ → allow", () => {
  const src = "export function UserCard() {\n  return null;\n}\n";
  const a = run(ADV, () => frameworkSolidGate("/p/modules/u/src/stores/UserCard.tsx", src));
  expect(a?.kind).toBe("inform");
  expect(a?.reason).toContain("components/");
  expect(run(ADV, () => frameworkSolidGate("/p/modules/u/components/UserCard.tsx", src))).toBeNull();
});

test("E3 extended syntaxes: advisory default, deny on flag; legacy byte-identical", () => {
  const swift = "public protocol Store {\n    func get() -> String\n}\n";
  const a1 = run(ADV, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/Views/Home.swift", content: swift }));
  expect(a1?.kind).toBe("inform");
  expect(run(DENY, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/Views/Home.swift", content: swift }))?.kind).toBe("block");
  const kt = "sealed interface Repo {\n}\n";
  expect(run(ADV, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/controllers/R.kt", content: kt }))?.kind).toBe("inform");
  expect(run(DENY, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/controllers/R.kt", content: kt }))?.kind).toBe("block");
  const go = "package h\n\ntype store interface {\n\tM() string\n}\n";
  expect(run(ADV, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/handlers/s.go", content: go }))?.kind).toBe("inform");
  expect(run(DENY, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/handlers/s.go", content: go }))?.kind).toBe("block");
  // Byte-parity: plain protocol/interface keep the exact legacy block.
  const legacySwift = run(ADV, () => interfaceSeparationGuard({ tool: "Write", filePath: "/p/Views/Home.swift", content: "protocol Store {\n}\n" }));
  expect(legacySwift?.kind).toBe("block");
  expect(legacySwift?.reason).toBe("SOLID VIOLATION: Protocol in view file. Move to Sources/Interfaces/");
});

test("E4 self-gate sources: detectors never self-match (react-family paths)", () => {
  for (const f of ["framework-solid-extended.ts", "detect-framework.ts", "conventions/stores.ts", "conventions/query.ts"]) {
    const path = join("/repo/src/policy", f);
    const content = readFileSync(join(new URL("..", import.meta.url).pathname, "src/policy", f), "utf8");
    expect(run(DENY, () => frameworkSolidGate(path, content))).toBeNull();
  }
});
