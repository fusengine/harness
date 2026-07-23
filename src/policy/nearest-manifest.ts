import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { detectProjectType } from "./detect-project";

/** Real project capabilities inferred from a manifest's deps + config files. */
export type Cap =
  | "react" | "nextjs" | "vue" | "svelte" | "angular" | "nuxt"
  | "laravel" | "swift" | "tailwind"
  | "tanstack-start" | "tanstack-router" | "tanstack-query" | "vue-query"
  | "zustand" | "pinia";

/** Manifest filenames that anchor a project root (any one marks the dir). */
const MANIFESTS = ["package.json", "composer.json", "Package.swift", "Cargo.toml", "go.mod", "pyproject.toml"];

/**
 * Walk up from `startDir` to the NEAREST ancestor holding any manifest file.
 * Unlike {@link projectRootOrNull} (which prefers the `.git` boundary and would
 * skip a nested `scripts/package.json`), this returns the closest manifest dir,
 * so an inner monorepo package wins over the repo root.
 * @param startDir - Directory to begin the walk-up from.
 * @returns The nearest manifest directory, or `null` at the filesystem root.
 */
export function nearestManifestDir(startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (MANIFESTS.some((m) => existsSync(join(current, m)))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Read the REAL capabilities of the project rooted at `dir`: JS-framework deps
 * from `package.json` (which {@link detectProjectType} does NOT scan), plus the
 * non-JS/config signals detectProjectType already covers (laravel/swift/
 * tailwind) — reused, not duplicated. Fail-open: any parse error yields whatever
 * was gathered so far, never throws.
 * @param dir - A manifest directory (from {@link nearestManifestDir}), or null.
 * @returns The set of detected capabilities (empty when `dir` is null).
 */
export function projectCaps(dir: string | null): Set<Cap> {
  const caps = new Set<Cap>();
  if (!dir) return caps;
  try {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ("react" in deps || "react-dom" in deps) caps.add("react");
      if ("next" in deps) caps.add("nextjs");
      if ("vue" in deps) caps.add("vue");
      if ("svelte" in deps) caps.add("svelte");
      if ("@angular/core" in deps) caps.add("angular");
      if ("nuxt" in deps) caps.add("nuxt");
      if ("tailwindcss" in deps) caps.add("tailwind");
      if ("@tanstack/react-start" in deps) caps.add("tanstack-start");
      if ("@tanstack/react-router" in deps) caps.add("tanstack-router");
      if ("@tanstack/react-query" in deps) caps.add("tanstack-query");
      if ("@tanstack/vue-query" in deps) caps.add("vue-query");
      if ("zustand" in deps) caps.add("zustand");
      if ("pinia" in deps) caps.add("pinia");
    }
    const type = detectProjectType(dir);
    if (type === "laravel") caps.add("laravel");
    if (type === "swift") caps.add("swift");
    if (type === "tailwind") caps.add("tailwind");
  } catch {
    // fail-open: return what we have
  }
  return caps;
}
