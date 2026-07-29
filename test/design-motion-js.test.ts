import { test, expect } from "bun:test";
import { htmlCssOnlyGate } from "../src/policy/design/gates";

/**
 * C4: the design write-allowlist bans every `.js` file, but all 11 corpus
 * references ship their animation as a SEPARATE `motion*.js` file — the gate
 * must allow that pattern specifically, never `.js` in general.
 */
test("C4: motion.js is allowed (bare motion file)", () => {
  expect(htmlCssOnlyGate("motion.js")).toBeNull();
});

test("C4: motion-nav.js is allowed (hyphenated motion file)", () => {
  expect(htmlCssOnlyGate("src/site/motion-nav.js")).toBeNull();
});

test("C4: motion-scroll.js under a nested path is allowed", () => {
  expect(htmlCssOnlyGate("output/umbrel-recode/motion-scroll.js")).toBeNull();
});

test("C4 anti-over-width: app.js (generic JS, no motion prefix) is still blocked", () => {
  expect(htmlCssOnlyGate("src/site/app.js")?.kind).toBe("block");
});

test("C4 anti-over-width: motionless-app.js (motion PREFIX only, not the motion*.js shape) is still blocked", () => {
  expect(htmlCssOnlyGate("src/site/motionless-app.js")?.kind).toBe("block");
});

test("C4 non-regression: .tsx is still blocked (framework files stay off-limits)", () => {
  expect(htmlCssOnlyGate("src/components/x.tsx")?.kind).toBe("block");
});
