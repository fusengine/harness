import { test, expect } from "bun:test";
import { segments, tokenize } from "../src/policy/shell-read-refs";

// Pins the (now exported) helpers: motion/command.ts depends on this exact behaviour.

test("segments splits on && || ; | and newlines", () => {
  expect(segments("a && b || c; d | e\nf")).toEqual(["a ", " b ", " c", " d ", " e", "f"]);
  expect(segments("single")).toEqual(["single"]);
  expect(segments("a & b")).toEqual(["a & b"]);
});

test("tokenize: whitespace split, one quote layer stripped per token", () => {
  expect(tokenize(`ffmpeg -i "my file.mp4" 'x y' plain`)).toEqual(["ffmpeg", "-i", "my file.mp4", "x y", "plain"]);
  expect(tokenize("   ")).toEqual([]);
  expect(tokenize(`sh -c "./render.sh --stage master"`)).toEqual(["sh", "-c", "./render.sh --stage master"]);
});

test("tokenize leaves unbalanced quotes untouched", () => {
  expect(tokenize(`echo "abc def`)).toEqual(["echo", '"abc', "def"]);
});
