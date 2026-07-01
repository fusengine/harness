/**
 * PostToolUse (matcher "Write|Edit") for the tailwindcss scope: warn
 * (non-blocking) on a deprecated `@tailwind` directive, excessive `@apply`
 * usage, and an overlong `className` string on a just-written CSS/TSX/JSX
 * file inside a detected Tailwind project. Ports `validate-tailwind.py`.
 */
import { dirname, join } from "node:path";
import { readText, pathExists } from "../../util/runtime-io";
import { contextResponse } from "../../adapters/claude";

/** Tailwind config file names checked at each ancestor directory. */
const TAILWIND_CONFIGS = ["tailwind.config.js", "tailwind.config.ts", "tailwind.config.mjs", "tailwind.config.cjs"];

/** Walk up to 20 levels from `filePath`'s directory to the nearest ancestor holding `package.json` or a Tailwind config (parity `find_project_root`). */
function findProjectRoot(filePath: string): string | null {
  let dir = dirname(filePath);
  for (let i = 0; i < 20; i++) {
    if (pathExists(join(dir, "package.json")) || TAILWIND_CONFIGS.some((cfg) => pathExists(join(dir, cfg)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** True when `filePath` belongs to a Tailwind project (v3 config, or `tailwindcss` in package.json deps). Parity `is_tailwind_project`. */
function isTailwindProject(filePath: string): boolean {
  const root = findProjectRoot(filePath);
  if (!root) return false;
  if (TAILWIND_CONFIGS.some((cfg) => pathExists(join(root, cfg)))) return true;
  const pkgPath = join(root, "package.json");
  if (!pathExists(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readText(pkgPath)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return Boolean(pkg.dependencies?.tailwindcss) || Boolean(pkg.devDependencies?.tailwindcss);
  } catch {
    return false;
  }
}

/**
 * Validate Tailwind best practices on a just-written file.
 * @param tool - The tool name (only "Write"/"Edit" are checked).
 * @param filePath - The written file's absolute path.
 * @returns The PostToolUse `additionalContext` response, or `""` when clean/inert.
 */
export function validateTailwind(tool: string, filePath: string): string {
  if (tool !== "Write" && tool !== "Edit") return "";
  if (!/\.(css|tsx|jsx)$/.test(filePath)) return "";
  if (!pathExists(filePath) || !isTailwindProject(filePath)) return "";

  let content: string;
  try {
    content = readText(filePath);
  } catch {
    return "";
  }

  const warnings: string[] = [];

  if (filePath.endsWith(".css")) {
    if (/@tailwind (base|components|utilities)/.test(content)) {
      warnings.push("Tailwind v4: @tailwind directives are deprecated - use @import 'tailwindcss'.");
    }
    const applyCount = (content.match(/@apply/g) ?? []).length;
    if (applyCount > 10) {
      warnings.push(`Excessive @apply usage (${applyCount}) - prefer utility classes directly.`);
    }
  }

  if (/\.(tsx|jsx)$/.test(filePath)) {
    const longClasses = (content.match(/className="[^"]{150,}"/g) ?? []).length;
    if (longClasses > 0) {
      warnings.push(`Very long className (${longClasses} lines) - extract to @utility or use cn().`);
    }
  }

  if (warnings.length === 0) return "";
  return contextResponse("PostToolUse", warnings.join(" "));
}
