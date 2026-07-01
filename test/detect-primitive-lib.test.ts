import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectPrimitiveLib } from "../src/policy/detect-primitive-lib";

const tmp = (): string => mkdtempSync(join(tmpdir(), "fh-primitive-"));

test("detectPrimitiveLib: radix via package.json + components.json style + bun lockfile", () => {
  const dir = tmp();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "@radix-ui/react-dialog": "^1.0.0" } }));
  writeFileSync(join(dir, "components.json"), JSON.stringify({ style: "new-york" }));
  writeFileSync(join(dir, "bun.lockb"), "");
  const got = detectPrimitiveLib(dir);
  expect(got.primitive).toBe("radix");
  expect(got.confidence).toBe(60);
  expect(got.pm).toBe("bun");
  expect(got.signals).toContain("pkg:radix-ui");
});

test("detectPrimitiveLib: base-ui via package.json + components.json style, no lockfile -> npm", () => {
  const dir = tmp();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "@base-ui/react": "^1.0.0" } }));
  writeFileSync(join(dir, "components.json"), JSON.stringify({ style: "base-vega" }));
  const got = detectPrimitiveLib(dir);
  expect(got.primitive).toBe("base-ui");
  expect(got.confidence).toBe(60);
  expect(got.pm).toBe("npm");
});

test("detectPrimitiveLib: mixed when both accumulate signal, none when neither does", () => {
  const dir = tmp();
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    dependencies: { "@radix-ui/react-dialog": "^1.0.0", "@base-ui/react": "^1.0.0" },
  }));
  const mixed = detectPrimitiveLib(dir);
  expect(mixed.primitive).toBe("mixed");
  expect(mixed.confidence).toBe(40);

  const none = detectPrimitiveLib(tmp());
  expect(none.primitive).toBe("none");
  expect(none.confidence).toBe(0);
});

test("detectPrimitiveLib: import scan picks up @radix-ui/react- under src/", () => {
  const dir = tmp();
  mkdirSync(join(dir, "src", "components"), { recursive: true });
  writeFileSync(join(dir, "src", "components", "dialog.tsx"), "import * as Dialog from '@radix-ui/react-dialog';");
  const got = detectPrimitiveLib(dir);
  expect(got.primitive).toBe("radix");
  expect(got.signals).toContain("import:radix");
});
