import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

/** Injectable filesystem existence check (defaults to a real disk check). */
type Exists = (p: string) => boolean;

/** Injectable UTF-8 file reader, for config-content checks (defaults to a real disk read). */
type ReadText = (p: string) => string;

/** One verification-command family (JS/TS, Python, Go, ...). */
interface Ecosystem {
  readonly extensions: readonly string[];
  readonly rootMarkers: readonly string[];
  readonly defaultCommand: string;
  readonly detect: (dir: string, exists: Exists, readText: ReadText) => string;
}

/** The generic, project-agnostic refusal — used only when nothing at all was detected. */
const GENERIC_HINT =
  "Run your test suite and static checker (bun test + tsc, pytest + mypy, go test + go vet, " +
  "cargo test + cargo check, phpunit/pest + phpstan, swift test, dart test) with exit 0 and 0 " +
  "failures, then re-complete.";

/** Best-effort read; an unreadable/missing config file never crashes the gate. */
function safeRead(path: string, readText: ReadText): string {
  try {
    return readText(path);
  } catch {
    return "";
  }
}

/** JS/TS: the lockfile picks the test runner; the typechecker is appended only when a tsconfig exists. */
function detectJsTs(dir: string, exists: Exists): string {
  const bun = exists(join(dir, "bun.lock")) || exists(join(dir, "bun.lockb"));
  const pm = bun ? "bun" : exists(join(dir, "pnpm-lock.yaml")) ? "pnpm" : exists(join(dir, "yarn.lock")) ? "yarn" : "npm";
  if (!exists(join(dir, "tsconfig.json"))) return `${pm} test`;
  return `${pm} test + ${bun ? "bunx tsc --noEmit" : "tsc"}`;
}

/** Python: pytest, plus pyright (`pyrightconfig.json`) or mypy (`mypy.ini` / `[tool.mypy]`) when configured. */
function detectPython(dir: string, exists: Exists, readText: ReadText): string {
  if (exists(join(dir, "pyrightconfig.json"))) return "pytest + pyright";
  const pyproject = join(dir, "pyproject.toml");
  const hasToolMypy = exists(pyproject) && safeRead(pyproject, readText).includes("[tool.mypy]");
  if (exists(join(dir, "mypy.ini")) || hasToolMypy) return "pytest + mypy";
  return "pytest";
}

/** PHP: prefer `php artisan test`, then Pest, then plain PHPUnit; append PHPStan when configured. */
function detectPhp(dir: string, exists: Exists): string {
  const base = exists(join(dir, "artisan")) ? "php artisan test" : exists(join(dir, "tests", "Pest.php")) ? "vendor/bin/pest" : "vendor/bin/phpunit";
  const phpstan = exists(join(dir, "phpstan.neon")) || exists(join(dir, "phpstan.neon.dist"));
  return phpstan ? `${base} + vendor/bin/phpstan analyse` : base;
}

/** Dart/Flutter: `flutter test` only when `pubspec.yaml` declares a `flutter:` key. */
function detectDart(dir: string, exists: Exists, readText: ReadText): string {
  const pubspec = join(dir, "pubspec.yaml");
  if (!exists(pubspec)) return "dart test";
  return /flutter:/.test(safeRead(pubspec, readText)) ? "flutter test" : "dart test";
}

/** The seven detectable ecosystems, in the same order as {@link GENERIC_HINT}. */
const ECOSYSTEMS: readonly Ecosystem[] = [
  { extensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"], rootMarkers: ["package.json"], defaultCommand: "bun test + tsc", detect: detectJsTs },
  { extensions: [".py"], rootMarkers: ["pyproject.toml", "setup.py", "requirements.txt", "pytest.ini"], defaultCommand: "pytest + mypy", detect: detectPython },
  { extensions: [".go"], rootMarkers: ["go.mod"], defaultCommand: "go test + go vet", detect: () => "go test ./... + go vet ./..." },
  { extensions: [".rs"], rootMarkers: ["Cargo.toml"], defaultCommand: "cargo test + cargo check", detect: () => "cargo test + cargo check" },
  { extensions: [".php"], rootMarkers: ["composer.json"], defaultCommand: "phpunit/pest + phpstan", detect: detectPhp },
  { extensions: [".swift"], rootMarkers: ["Package.swift"], defaultCommand: "swift test", detect: () => "swift test" },
  { extensions: [".dart"], rootMarkers: ["pubspec.yaml"], defaultCommand: "dart test", detect: detectDart },
];

/**
 * `cwd` plus, per modified file, its first two directory levels (owner-specified
 * monorepo reach). Same containment idiom as `contains` in
 * `src/adapters/cursor/context.ts` and `src/policy/prd/prd-paths.ts`
 * (`!rel.startsWith("..") && !isAbsolute(rel)`); a modified file path that
 * resolves outside `cwd` is skipped, never turned into a search dir.
 * Deduped via `Set` (insertion order preserved) — thousands of modified
 * files in a few directories would otherwise repeat the same `existsSync`
 * probes per ecosystem marker.
 */
function searchDirs(cwd: string, files: readonly string[]): string[] {
  const dirs = new Set<string>([cwd]);
  for (const f of files) {
    const rel = relative(cwd, resolve(cwd, f));
    if (rel.startsWith("..") || isAbsolute(rel)) continue;
    const [first, second] = rel.split(/[\\/]/).filter(Boolean);
    if (first) dirs.add(join(cwd, first));
    if (first && second) dirs.add(join(cwd, first, second));
  }
  return [...dirs];
}

/**
 * Detect which language ecosystem(s) the modified files belong to (project
 * markers in `cwd` and each file's first two directory levels, unioned with
 * the files' own extensions) and name only the relevant verification
 * commands — never the full cross-language list unless nothing matches.
 *
 * Deliberately NOT built on {@link detectProjectType} from
 * `../../policy/detect-project`: that helper returns a single, first-match-wins
 * `ProjectType` (nextjs beats nuxt beats ... beats go/rust/swift/generic) meant
 * for framework/skill routing — a dir with both `package.json` and `go.mod`
 * (a JS+Go monorepo root) collapses to one framework and would silently drop
 * the other ecosystem's test command. `receiptHint` instead needs the UNION of
 * every matching ecosystem across MULTIPLE searched dirs, plus per-ecosystem
 * command shape (`detectJsTs`'s lockfile → package-manager pick, `detectPython`'s
 * pyright/mypy config, `detectPhp`'s artisan/pest/phpunit + phpstan,
 * `detectDart`'s `flutter:` key in `pubspec.yaml`) that `detectProjectType` has
 * no equivalent for. Reusing it would be a lossy wrapper, not a simplification;
 * see `src/policy/nearest-manifest.ts` `projectCaps` for a case where reuse DOES
 * fit (three independent yes/no capability checks against one already-resolved
 * dir, not a cross-directory language union).
 * @param cwd - The hook's working directory (searched first).
 * @param modifiedFiles - Files changed during the session (relative or absolute).
 * @param exists - Injectable `fs.existsSync` (real disk by default).
 * @param readText - Injectable UTF-8 file reader, for config-content checks (real disk by default).
 * @returns One sentence naming the detected ecosystem's commands, or the generic list.
 */
export function receiptHint(
  cwd: string,
  modifiedFiles: readonly string[],
  exists: Exists = existsSync,
  readText: ReadText = (p) => readFileSync(p, "utf-8"),
): string {
  const dirs = searchDirs(cwd, modifiedFiles);
  const extensions = new Set(modifiedFiles.map((f) => extname(f)));
  const parts: string[] = [];
  for (const eco of ECOSYSTEMS) {
    const markerDir = dirs.find((d) => eco.rootMarkers.some((m) => exists(join(d, m))));
    if (markerDir) parts.push(eco.detect(markerDir, exists, readText));
    else if (eco.extensions.some((e) => extensions.has(e))) parts.push(eco.defaultCommand);
  }
  if (parts.length === 0) return GENERIC_HINT;
  return `Run ${parts.join(" and ")} (exit 0, 0 failures), then re-complete.`;
}
