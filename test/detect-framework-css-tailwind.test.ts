import { test, expect } from "bun:test";
import { detectFramework } from "../src/policy/detect-framework";

/**
 * C7: a `.css` file is only classified "tailwind" when its CONTENT shows it
 * — bare `.css` extension used to force EVERY hand-written stylesheet into
 * the tailwind skill-consultation gate, no matter its content.
 */
test("C7: a .css file with no Tailwind marker is NOT classified tailwind", () => {
  const css = "body { margin: 0; padding: 0; } .header { display: flex; }";
  expect(detectFramework("src/styles/site.css", css)).not.toBe("tailwind");
});

test("C7: a .css file with @apply is classified tailwind", () => {
  const css = ".btn-primary {\n  @apply bg-blue-500 text-white px-4 py-2 rounded-lg;\n}";
  expect(detectFramework("src/styles/buttons.css", css)).toBe("tailwind");
});

test("C7: a .css file with @tailwind (v3 directive) is classified tailwind", () => {
  const css = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n";
  expect(detectFramework("src/styles/globals.css", css)).toBe("tailwind");
});

test("C7 non-regression: a .tsx file with utility classes keeps its existing (non-css) classification", () => {
  const tsx = "export const Card = () => <div className=\"flex items-center p-4\">hi</div>;";
  // No project caps injected here (no package.json), so the JS-family signal
  // reconciles to "generic" — the point is that .tsx utility-class usage is
  // routed through the EXISTING react/jsHint path, never through the new
  // CSS-content branch this fix touches.
  expect(detectFramework("src/components/Card.tsx", tsx)).not.toBe("tailwind");
});

test("C7 empty-content decision: detectFramework(cssPath, \"\") resolves to generic, not tailwind", () => {
  // Documented decision: empty content can never prove Tailwind usage, so it
  // falls through to the fail-open \"generic\" contract instead of guessing.
  expect(detectFramework("src/styles/unknown.css", "")).toBe("generic");
});
