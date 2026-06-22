import { test, expect } from "bun:test";
import { parseEnvInt } from "../src/config/env";
import { resolveTtlSec, ttlLabel, DEFAULT_TTL_SEC } from "../src/config/ttl";
import { resolveMaxLines, splitTarget, DEFAULT_MAX_LINES } from "../src/config/limits";

test("parseEnvInt: valid positive integer", () => {
  expect(parseEnvInt("240", 100)).toBe(240);
});

test("parseEnvInt: empty / NaN / float / non-positive -> fallback", () => {
  for (const bad of ["", "   ", undefined, "1.5", "abc", "0", "-5"]) {
    expect(parseEnvInt(bad, 100)).toBe(100);
  }
});

test("resolveTtlSec: default and override", () => {
  expect(resolveTtlSec({})).toBe(DEFAULT_TTL_SEC);
  expect(resolveTtlSec({ FUSE_ENFORCE_TTL_SEC: "240" })).toBe(240);
});

test("ttlLabel: minute vs second formatting", () => {
  expect(ttlLabel(120)).toBe("2min");
  expect(ttlLabel(240)).toBe("4min");
  expect(ttlLabel(90)).toBe("90s");
});

test("resolveMaxLines + splitTarget", () => {
  expect(resolveMaxLines({})).toBe(DEFAULT_MAX_LINES);
  expect(resolveMaxLines({ FUSE_SOLID_MAX_LINES: "150" })).toBe(150);
  expect(splitTarget(100)).toBe(90);
  expect(splitTarget(5)).toBe(1);
});
