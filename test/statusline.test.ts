import { test, expect } from "bun:test";
import { formatTokens, formatCost, formatTimeLeft, formatPath } from "../src/statusline/formatters";
import { generateProgressBar, generateGradientBar } from "../src/statusline/progress-bar";
import { progressiveColor, colors } from "../src/statusline/colors";

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

test("formatters", () => {
  expect(formatTokens(12_300)).toBe("12K");
  expect(formatTokens(12_300, true)).toBe("12.3K");
  expect(formatCost(1.2)).toBe("$1.20");
  expect(formatTimeLeft(0)).toBe("0m");
  expect(formatTimeLeft(90 * 60_000)).toBe("1h - 30m");
  expect(formatPath("/etc/hosts", "basename")).toBe("hosts");
});

test("progress bar: length + fill ratio", () => {
  const bar = strip(generateProgressBar(50, { length: 10 }));
  expect(bar.length).toBe(10);
  expect([...bar].filter((c) => c === "█").length).toBe(5);
  expect(strip(generateProgressBar(50, { length: 10, showPercentage: true }))).toContain("50%");
});

test("gradient bar length", () => {
  expect(strip(generateGradientBar(75, 8)).length).toBe(8);
  expect(strip(generateGradientBar(0, 4)).length).toBe(4);
});

test("progressiveColor thresholds (ANSI applied)", () => {
  expect(progressiveColor(95, "x")).toContain("\x1b[");
  expect(strip(colors.green("ok"))).toBe("ok");
});
