import { test, expect } from "bun:test";
import { bashWriteGuard } from "../src/policy/guards/bash-write";
import type { GuardContext } from "../src/policy/guards/context";

/**
 * Inline JS/TS runtime write detection (bash-write-patterns.ts
 * INLINE_JS_ANCHOR + JS_RUNTIME_WRITES + CODE_FILE_LITERAL) — parity
 * PYTHON_C_ANCHOR/PYTHON_WRITES content-gating, widened past `node -e` to
 * `bun -e`/`--eval`/`-p`/`--print` and `deno eval`. See bashWriteGuard's
 * INLINE_JS_ANCHOR branch in bash-write.ts (runs before SAFE_PREFIXES,
 * 2026-09-05 owner decision) for the block/ask/allow site.
 */

const cmd = (command: string): GuardContext => ({ tool: "Bash", command });

// Measured baseline: node -e write to a code file now BLOCKS (was ask).

test("node -e writeFileSync to a code file now blocks", () => {
  const result = bashWriteGuard(cmd('node -e \'require("fs").writeFileSync("src/x.ts","1")\''));
  expect(result?.kind).toBe("block");
  expect(result?.reason).toContain("Use Write/Edit");
});

test("node -e writeFileSync to a non-code file still asks", () => {
  expect(bashWriteGuard(cmd('node -e \'require("fs").writeFileSync("out.json","1")\''))?.kind).toBe("ask");
});

test("node -e appendFileSync to a quoted safe path still allows", () => {
  expect(bashWriteGuard(cmd('node -e \'require("fs").appendFileSync("~/.fuse-harness/cache/x.json","1")\''))).toBeNull();
});

// Gap closure: bun -e / --eval / deno eval writing a code file now blocks.

test("bun -e writeFileSync to a code file blocks", () => {
  expect(bashWriteGuard(cmd('bun -e \'require("fs").writeFileSync("src/x.ts","1")\''))?.kind).toBe("block");
});

test("bun -e Bun.write to a code file blocks", () => {
  expect(bashWriteGuard(cmd('bun -e \'await Bun.write("src/x.ts","1")\''))?.kind).toBe("block");
});

test("bun --eval writeFileSync to a .tsx file blocks", () => {
  expect(bashWriteGuard(cmd('bun --eval \'require("fs").writeFileSync("x.tsx","1")\''))?.kind).toBe("block");
});

test("bun -e writeFileSync to a non-code file still asks (parity node)", () => {
  expect(bashWriteGuard(cmd('bun -e \'require("fs").writeFileSync("out.json","1")\''))?.kind).toBe("ask");
});

test("deno eval Deno.writeTextFile to a code file blocks", () => {
  expect(bashWriteGuard(cmd('deno eval \'await Deno.writeTextFile("src/x.ts","1")\''))?.kind).toBe("block");
});

// Read-only / non-write inline scripts stay allowed regardless of runtime.

test("bun -e reading a code file (no write API) allows", () => {
  expect(bashWriteGuard(cmd('bun -e \'console.log(require("fs").readFileSync("src/x.ts","utf8").length)\''))).toBeNull();
});

test("bun -p a pure expression allows", () => {
  expect(bashWriteGuard(cmd("bun -p '1+1'"))).toBeNull();
});

test("bun test / bun run / bunx / bun scripts/*.ts stay allowed (not inline-script shaped)", () => {
  expect(bashWriteGuard(cmd("bun test"))).toBeNull();
  expect(bashWriteGuard(cmd("bun run build"))).toBeNull();
  expect(bashWriteGuard(cmd("bunx tsc --noEmit"))).toBeNull();
  expect(bashWriteGuard(cmd("bun scripts/gen.ts"))).toBeNull();
});

test("node -e naming a code-file extension with no write API allows", () => {
  expect(bashWriteGuard(cmd("node -e 'console.log(\"x.ts\")'"))).toBeNull();
});

// Wrapper closure (2026-09-05 owner decision): the INLINE_JS_ANCHOR+
// JS_RUNTIME_WRITES branch now runs BEFORE the SAFE_PREFIXES short-circuit
// (same slot as PYTHON_C_ANCHOR+PYTHON_WRITES) — a transparent wrapper no
// longer shields an inline-script code-file write, `env` included. The old
// KNOWN GAP ("env bun -e ... writeFileSync a.ts" fell through as null) is
// closed: every wrapper below now blocks like a bare invocation would.

test("blocks an inline write behind a non-SAFE_PREFIXES wrapper (timeout)", () => {
  expect(bashWriteGuard(cmd('timeout 5 bun -e \'require("fs").writeFileSync("a.ts","1")\''))?.kind).toBe("block");
  expect(bashWriteGuard(cmd('timeout 5 deno eval \'await Deno.writeTextFile("src/x.ts","1")\''))?.kind).toBe("block");
});

test("gap closed: `env` wrapper no longer shields an inline-script code-file write", () => {
  expect(bashWriteGuard(cmd('env bun -e \'require("fs").writeFileSync("a.ts","1")\''))?.kind).toBe("block");
});

test("timeout-wrapped node -e writing a .tsx file blocks", () => {
  expect(bashWriteGuard(cmd('timeout 5 node -e \'require("fs").writeFileSync("b.tsx","1")\''))?.kind).toBe("block");
});

test("mkdir-then-&&-chained bun -e writing a nested code file blocks", () => {
  expect(bashWriteGuard(cmd('mkdir -p my-test && bun -e \'require("fs").writeFileSync("my-test/big.ts","x")\''))?.kind).toBe("block");
});

test("cd-then-&&-chained node -e writing a non-code file still asks", () => {
  expect(bashWriteGuard(cmd('cd d && node -e \'require("fs").writeFileSync("out.json","1")\''))?.kind).toBe("ask");
});

test("env node -e with no write API still allows", () => {
  expect(bashWriteGuard(cmd("env node -e 'console.log(1)'"))).toBeNull();
});

// ruby -e parity: now gated by CODE_FILE_LITERAL like the JS/TS branch — a
// code-file target blocks, a non-code target still asks.

test("ruby -e File.write to a code file blocks", () => {
  expect(bashWriteGuard(cmd("ruby -e \"File.write('x.ts','1')\""))?.kind).toBe("block");
});

test("ruby -e File.write to a non-code file still asks", () => {
  expect(bashWriteGuard(cmd("ruby -e \"File.write('notes.txt','1')\""))?.kind).toBe("ask");
});

// Mention-not-command: quoted text naming "bun -e ... .ts" is never at a
// command position (no ^ / ;&|( separator precedes it), so INLINE_JS_ANCHOR
// cannot match it — this is the same anchor-vs-mention distinction CMD already
// proves for CODE_MUTATORS (git commit -m "fix sed -i doc").

test("mention of 'bun -e writeFileSync' inside a quoted argument does not block", () => {
  expect(bashWriteGuard(cmd('echo "bun -e writeFileSync a.ts"'))).toBeNull();
  expect(bashWriteGuard(cmd('git commit -m "bun -e writeFileSync"'))).toBeNull();
});

test("non-regression: passes a plain read + non-Bash tool", () => {
  expect(bashWriteGuard(cmd("ls -la src"))).toBeNull();
  expect(bashWriteGuard({ tool: "Write", command: "bun -e 'Bun.write(\"a.ts\",1)'" })).toBeNull();
});
