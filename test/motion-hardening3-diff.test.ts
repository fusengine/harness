import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { replacementText } from "../src/runtime/motion/diff-text";

function oldText(diff: string): string {
  const pattern = /^(<<<<<<<|-------) SEARCH\r?\n[\s\S]*?^=======\r?\n([\s\S]*?)^(>>>>>>>|\+{7}) REPLACE[ \t]*\r?$/gm;
  const replacements = [...diff.matchAll(pattern)];
  const valid = replacements.length > 0 && replacements.every((m) => m[1] === "<<<<<<<" ? m[3] === ">>>>>>>" : m[3] === "+++++++") && diff.replace(pattern, "").trim() === "";
  return valid ? replacements.map((m) => m[2] ?? "").join("\n") : diff;
}
test("1 preserved Cline replacement and fallback semantics", () => {
  const lines = ["<<<<<<< SEARCH", "------- SEARCH", "old", "=======", "new", ">>>>>>> REPLACE", "+++++++ REPLACE", ">>>>>>> REPLACE\t", ">>>>>>> REPLACE\u00a0"];
  const fixtures = ["<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE", "------- SEARCH\r\nold\r\n=======\r\nnew\r\n+++++++ REPLACE\r\n", "<<<<<<< SEARCH\nold\n=======\n+++++++ REPLACE\nx\n>>>>>>> REPLACE"];
  let seed = 91;
  for (let n = 0; n < 4000; n++) {
    const picked: string[] = [];
    for (let j = 0; j < 10; j++) { seed = (seed * 1664525 + 1013904223) >>> 0; picked.push(lines[seed % lines.length]!); }
    fixtures.push(picked.join("\n"));
  }
  for (const diff of fixtures) expect(replacementText(diff)).toBe(oldText(diff));
});
test("1 one MiB adverse diff is scanned under 50ms with subprocess timeout", () => {
  const child = spawnSync(process.execPath, ["-e", `import { replacementText } from './src/runtime/motion/diff-text.ts'; const input='<<<<<<< SEARCH\\n=======\\n'.repeat(50000); const t=performance.now(); replacementText(input); const ms=performance.now()-t; console.log(ms); if(ms>50) process.exit(1);`], { timeout: 3000, encoding: "utf8" });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
});
