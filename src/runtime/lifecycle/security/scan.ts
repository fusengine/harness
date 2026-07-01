/**
 * @module security/scan
 * OWASP vulnerability scanner. Ports the Python `security-scan.py`: detect the
 * project language, walk source files (excluding vendored/build dirs), match the
 * per-language {@link getPatterns} rules, and aggregate a JSON report. Invoked by
 * the `harness scan` CLI command (skill `/fuse-security:scan`), NOT a hook.
 * @packageDocumentation
 */
import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { getPatterns, type ScanPattern, type Severity } from "./scan-patterns";

const EXCLUDE_RE = /(^|\/)(node_modules|vendor|\.git|dist|build)(\/|$)/;
const LANG_FILES: readonly (readonly [string, string])[] = [
  ["package.json", "javascript"], ["composer.json", "php"], ["requirements.txt", "python"],
  ["pyproject.toml", "python"], ["Package.swift", "swift"], ["go.mod", "go"], ["Cargo.toml", "rust"],
];

/** A single vulnerability match in the scanned tree. */
export interface Finding {
  severity: Severity; category: string; pattern: string; file: string; line: number;
}

/** The full scan report (mirrors the Python JSON shape). */
export interface ScanReport {
  language: string; directory: string;
  summary: Record<string, number>; findings: Finding[];
}

/** Detect the project language from its config files (first match wins). */
export function detectLanguage(dir: string): string {
  for (const [file, lang] of LANG_FILES) if (existsSync(join(dir, file))) return lang;
  return "unknown";
}

/** Recursively collect files whose name ends with `ext`, skipping vendored dirs. */
function collectFiles(dir: string, ext: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (EXCLUDE_RE.test(full)) continue;
    if (e.isDirectory()) collectFiles(full, ext, out);
    else if (e.name.endsWith(ext)) out.push(full);
  }
  return out;
}

/** Apply one pattern to every matching file and collect line-level findings. */
function scanPattern(dir: string, p: ScanPattern): Finding[] {
  const ext = p.glob.replace(/^\*/, "");
  const findings: Finding[] = [];
  for (const file of collectFiles(dir, ext)) {
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    text.split("\n").forEach((line, i) => {
      if (p.regex.test(line)) findings.push({ severity: p.severity, category: p.category, pattern: p.regex.source, file, line: i + 1 });
    });
  }
  return findings;
}

/** Run the OWASP scan over `dir` and return the aggregated {@link ScanReport}. */
export function runSecurityScan(dir: string): ScanReport {
  const language = detectLanguage(dir);
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const findings: Finding[] = [];
  for (const p of getPatterns(language)) {
    const hits = scanPattern(dir, p);
    findings.push(...hits);
    const key = p.severity.toLowerCase();
    counts[key] = (counts[key] ?? 0) + hits.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { language, directory: dir, summary: { ...counts, total }, findings };
}
