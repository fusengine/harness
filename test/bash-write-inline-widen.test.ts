import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Challenger-measured bypass closures (2026-09-05) for the INLINE_JS_ANCHOR
 * widening: interpreter options between the runtime and the eval flag
 * (bypass #3), the tsx/ts-node/bunx/bun-x/npx runtime alternation (bypass
 * #5), bare (no `fs.` prefix) Sync write APIs (bypass #6), and the
 * case-insensitive CODE_FILE_LITERAL extension match (bypass #7). See
 * test/bash-write-inline-script.test.ts for the original anchor's baseline
 * coverage — split into this file to stay under the 200-line SOLID ceiling.
 */

const cmd = (command: string): GuardContext => ({ tool: "Bash", command });

// Bypass #3: interpreter options between the runtime token and the eval flag,
// plus the `--eval=value` (equals) form.

test("bypass #3: node --input-type=module -e writing a code file now blocks (was allow)", () => {
  const command = 'node --input-type=module -e \'require("fs").writeFileSync("src/x.ts","1")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #3: node -r ./p.cjs -e writing a code file now blocks", () => {
  const command = 'node -r ./p.cjs -e \'require("fs").writeFileSync("src/x.ts","1")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #3: node --eval=... (equals form) writing a code file blocks", () => {
  expect(bashWriteGuard(cmd('node --eval=\'require("fs").writeFileSync("src/x.ts","1")\''))?.kind).toBe("block");
});

test("witness: node --input-type=module -e with no write API still allows", () => {
  expect(bashWriteGuard(cmd("node --input-type=module -e 'console.log(1)'"))).toBeNull();
});

// Bypass #5: tsx / ts-node / bunx / bun x / npx runtimes.

test("bypass #5: bunx tsx -e writing a code file now blocks (was allow)", () => {
  const command = 'bunx tsx -e \'require("fs").writeFileSync("src/x.ts","1")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #5: bun x tsx -e writing a code file blocks", () => {
  const command = 'bun x tsx -e \'require("fs").writeFileSync("src/x.ts","1")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("bypass #5: npx ts-node -e writing a code file blocks", () => {
  const command = 'npx ts-node -e \'require("fs").writeFileSync("src/x.ts","1")\'';
  expect(bashWriteGuard(cmd(command))?.kind).toBe("block");
});

test("witness: bunx tsx -e with no write API still allows", () => {
  expect(bashWriteGuard(cmd("bunx tsx -e 'console.log(1)'"))).toBeNull();
});

// Bypass #6: bare (no `fs.` prefix) Sync write APIs, plus Bun/Deno additions.

test("bypass #6: bare unlinkSync on a code file now blocks (was allow)", () => {
  expect(bashWriteGuard(cmd('node -e \'unlinkSync("src/x.ts")\''))?.kind).toBe("block");
});

test("bypass #6: bare rmSync on a code file now blocks", () => {
  expect(bashWriteGuard(cmd('node -e \'rmSync("src/x.ts")\''))?.kind).toBe("block");
});

test("bypass #6: Bun.file(...).writer on a code file now blocks", () => {
  expect(bashWriteGuard(cmd('bun -e \'Bun.file("src/x.ts").writer()\''))?.kind).toBe("block");
});

test("bypass #6: Deno.open on a code file now blocks", () => {
  expect(bashWriteGuard(cmd('deno eval \'await Deno.open("src/x.ts",{write:true})\''))?.kind).toBe("block");
});

test("witness: bare unlinkSync on a non-code target still asks (never blocks)", () => {
  expect(bashWriteGuard(cmd('node -e \'unlinkSync("out.json")\''))?.kind).toBe("ask");
});

// Bypass #7: CODE_FILE_LITERAL is case-insensitive.

test("bypass #7: writeFileSync to an upper-case .TS extension now blocks (was ask)", () => {
  expect(bashWriteGuard(cmd('node -e \'require("fs").writeFileSync("src/X.TS","1")\''))?.kind).toBe("block");
});

test("witness: mixed-case non-code extension still asks", () => {
  expect(bashWriteGuard(cmd('node -e \'require("fs").writeFileSync("OUT.JSON","1")\''))?.kind).toBe("ask");
});
