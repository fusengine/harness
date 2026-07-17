import type { Prompt } from "../prompt/types";
import {
  isExcludedJsPath,
  isExcludedPhpPath,
  isExcludedSwiftPath,
  isSelfGateSourcePath,
} from "./framework-solid-exclude";
import { laravelGate, nextGate, reactGate, swiftGate } from "./framework-solid-gates";
import { goGate, rustGate } from "./framework-solid-gates-systems";

/** Next.js detection: directive, runtime types, or a `next` import. */
const NEXT_RE: RegExp = /(use client|use server|NextRequest|NextResponse|from ['"]next)/;

/** Build a SOLID `block` prompt from one or more violation messages. */
function block(filePath: string, violations: string[]): Prompt {
  return {
    kind: "block",
    title: "SOLID violation",
    reason: `SOLID VIOLATION in ${filePath}: ${violations.join(" ")}`,
    actions: violations,
  };
}

/** Run the JS/TS gate (React or Next.js), honoring build-artifact exclusions. */
function jsViolations(filePath: string, content: string, fileLines?: number): string[] {
  if (isExcludedJsPath(filePath) || isSelfGateSourcePath(filePath)) return [];
  return NEXT_RE.test(content)
    ? nextGate(filePath, content, fileLines)
    : reactGate(filePath, content, fileLines);
}

/**
 * Framework-specific SOLID gate. Dispatches by extension/path to the matching
 * validator (React, Next.js, Laravel, Swift, Go, Rust) and returns a blocking
 * {@link Prompt} when any BLOCKING rule fires, or `null` when clean. Excluded
 * build/dependency paths (node_modules, dist, build, .next, vendor, .build,
 * DerivedData, Pods) early-return `null` to avoid false positives. Go and Rust
 * have no exclusion list yet (no vendor/target FPs reported) — additive only.
 * @param filePath - absolute path of the file being written/edited
 * @param content - the file (or new) content under validation
 * @param fileLines - full on-disk line count (set on Edit so a partial
 *   `new_string` snippet still judges the whole file, mirroring the base
 *   file-size guard / Python `get_full_file_content`). Omit on Write.
 */
export function frameworkSolidGate(filePath: string, content: string, fileLines?: number): Prompt | null {
  if (!filePath || !content) return null;
  let violations: string[] = [];
  if (filePath.endsWith(".php")) {
    if (isExcludedPhpPath(filePath)) return null;
    violations = laravelGate(filePath, content, fileLines);
  } else if (filePath.endsWith(".swift")) {
    if (isExcludedSwiftPath(filePath)) return null;
    violations = swiftGate(filePath, content, fileLines);
  } else if (/\.(tsx|ts|jsx|js)$/.test(filePath)) {
    violations = jsViolations(filePath, content, fileLines);
  } else if (filePath.endsWith(".go")) {
    violations = goGate(filePath, content, fileLines);
  } else if (filePath.endsWith(".rs")) {
    violations = rustGate(filePath, content, fileLines);
  }
  return violations.length ? block(filePath, violations) : null;
}
