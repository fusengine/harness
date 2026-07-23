import { test, expect } from "bun:test";
import { interfaceSeparationGuard } from "../src/policy/guards/interface-separation";

const ctx = (filePath: string, content: string) => ({ tool: "Write", filePath, content });

test("interface-sep: legacy deny cases are byte-preserved (masked content)", () => {
  const iface = ctx("/p/components/Btn.tsx", "export interface Props {\n  label: string;\n}");
  expect(interfaceSeparationGuard(iface)?.reason).toContain("modules/[feature]/src/interfaces/");
  const local = ctx("/p/components/Btn.tsx", "interface Props {\n  label: string;\n}");
  expect(interfaceSeparationGuard(local)?.kind).toBe("block"); // local interface: parity, still denied
});

test("interface-sep: comment/string/template-literal interfaces no longer fire", () => {
  expect(interfaceSeparationGuard(ctx("/p/components/Btn.tsx", "// export interface Fake {\nexport const a = 1;"))).toBeNull();
  const fixture = "const F = `\nexport interface Fake {\n`;\nexport const a = 1;";
  expect(interfaceSeparationGuard(ctx("/p/components/Btn.tsx", fixture))).toBeNull();
  expect(interfaceSeparationGuard(ctx("/p/views/home.py", "# class M(BaseModel):\nx = 1"))).toBeNull();
});

test("interface-sep: exported type alias redirects to types/ — deny by default (F1.2), advisory on opt-out", () => {
  const c = ctx("/p/components/Btn.tsx", "export type Props = { label: string };");
  const prev = process.env.FUSE_CONVENTIONS_MODE;
  delete process.env.FUSE_CONVENTIONS_MODE;
  try {
    const byDefault = interfaceSeparationGuard(c);
    expect(byDefault?.kind).toBe("block"); // deny-first default
    expect(byDefault?.reason).toContain("modules/[feature]/src/types/");
    process.env.FUSE_CONVENTIONS_MODE = "advisory";
    expect(interfaceSeparationGuard(c)?.kind).toBe("inform");
  } finally {
    if (prev === undefined) delete process.env.FUSE_CONVENTIONS_MODE;
    else process.env.FUSE_CONVENTIONS_MODE = prev;
  }
});

test("interface-sep: alias in comment does not fire the types/ advisory", () => {
  expect(interfaceSeparationGuard(ctx("/p/components/Btn.tsx", "// export type Fake = string;\nexport const a = 1;"))).toBeNull();
});
