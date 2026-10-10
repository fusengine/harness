import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { criticViolation } from "../src/policy/motion/critic";
const cwd = "/tmp/motion-critic3";
const review = `${cwd}/.motion/review`;
const check = (command: string) => criticViolation("Bash", undefined, command, review, cwd);

test("4: unfamiliar and implicit filter writers fail closed", () => {
  for (const filter of ["libvmaf=log_path=/tmp/v.log", "vidstabdetect=result=/tmp/v.trf", "vidstabdetect", "signature=filename=/tmp/s.sig", "unknown=anything"]) {
    expect(check(`ffmpeg -i a.mp4 -vf '${filter}' .motion/review/o.png`)?.kind).toBe("block");
  }
});
test("5: opaque encoder options cannot hide secondary paths", () => {
  for (const opt of ["x264-params", "x264opts"]) {
    expect(check(`ffmpeg -i a.mp4 -${opt} .motion/review/a=1:stats=/tmp/s.log .motion/review/o.png`)?.kind).toBe("block");
  }
});
test("21: lavfi input graphs use the same filter sandbox", () => {
  for (const command of [
    "ffmpeg -f lavfi -i 'movie=in.mp4,metadata=mode=print:file=src/pwn.txt' -f null -",
    "ffprobe -f lavfi 'movie=in.mp4,metadata=mode=print:file=src/pwn.txt'",
    "ffprobe -f lavfi 'metadata=mode=print:file=src/pwn.txt' -show_entries format=duration",
    "ffmpeg -f lavfi -graph_file /tmp/graph -i ignored -f null -",
  ]) expect(check(command)?.kind).toBe("block");
  expect(check("ffmpeg -f lavfi -i 'color=red:size=320x180' -frames:v 1 .motion/review/o.png")).toBeNull();
});
test("7: adverse positional metadata has linear bounded cost", () => {
  const module = new URL("../src/policy/motion/critic-filters.ts", import.meta.url).pathname;
  const script = `import {filterViolation} from ${JSON.stringify(module)};
    const filter="metadata=print:x:x:x:x:-:"+"x:".repeat(524288)+"file=/tmp/evil";
    const start=performance.now();const result=filterViolation(filter,"/tmp/root/.motion/review","/tmp/root");
    console.log(JSON.stringify({blocked:result!==null,ms:performance.now()-start}));`;
  const result = spawnSync(process.execPath, ["-e", script], { timeout: 1500, encoding: "utf8" });
  expect(result.status).toBe(0);
  const measured = JSON.parse(result.stdout) as { blocked: boolean; ms: number };
  expect(measured.blocked).toBe(true);
  expect(measured.ms).toBeLessThan(1000);
}, 2500);
