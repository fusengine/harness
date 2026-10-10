import { expect, test } from "bun:test";
import { criticViolation } from "../src/policy/motion/critic";

const check = (command: string) => criticViolation("Bash", undefined, command, "/tmp/project/.motion/review", "/tmp/project");

test("3a: ffprobe output and report options never write", () => {
  for (const options of ["-o /tmp/x.json", "-o=/tmp/x.json", "-o .motion/review/x.json", "-report", "-report=1"]) {
    expect(check(`ffprobe ${options} -i a.mp4`)?.kind).toBe("block");
  }
});

test("3b: filter file writers outside the review pack are blocked", () => {
  for (const option of ["-vf", "-af", "-lavfi", "-filter_complex", "-filter:v"]) {
    for (const filter of ["metadata=mode=print:file=/tmp/m.txt", "ametadata=mode=print:file=/tmp/a.txt", "psnr=stats_file=/tmp/p.txt", "ssim=f=/tmp/s.txt"]) {
      expect(check(`ffmpeg -i a.mp4 ${option} '${filter}' .motion/review/o.png`)?.kind).toBe("block");
    }
  }
});

test("3: normal probe, frame extraction, scale and review filter logs remain allowed", () => {
  for (const command of ["ffprobe -show_entries format=duration -i a.mp4", "ffmpeg -i a.mp4 -frames:v 1 .motion/review/o.png", "ffmpeg -i a.mp4 -vf scale=320:-1 .motion/review/o.png", "ffmpeg -i a.mp4 -vf metadata=mode=print:file=.motion/review/m.txt .motion/review/o.png"]) {
    expect(check(command)).toBeNull();
  }
});

test("3b: escaped filter path delimiters cannot hide traversal", () => {
  expect(check("ffmpeg -i a.mp4 -vf 'metadata=mode=print:file=.motion/review/x\\:/../../../escape.txt' .motion/review/o.png")?.kind).toBe("block");
});

test("3b: positional metadata and comparison logs stay confined", () => {
  for (const option of ["-vf", "-af", "-lavfi", "-filter_complex"]) {
    for (const filter of ["metadata=print:foo:bar:equal:1:/tmp/motion-out.txt", "ametadata=print:foo:bar:equal:1:/tmp/motion-out.txt", "split[a][b],[a][b]psnr=/tmp/motion-out.txt", "ssim=/tmp/motion-out.txt"]) {
      expect(check(`ffmpeg -i a.mp4 ${option} '${filter}' .motion/review/o.png`)?.kind).toBe("block");
    }
  }
});

test("3b: safe positional filter files and scale remain allowed", () => {
  for (const filter of ["metadata=print:foo:bar:equal:1:.motion/review/m.txt", "psnr=.motion/review/p.txt", "ssim=.motion/review/s.txt", "scale=320:180"]) {
    expect(check(`ffmpeg -i a.mp4 -vf '${filter}' .motion/review/o.png`)).toBeNull();
  }
});
