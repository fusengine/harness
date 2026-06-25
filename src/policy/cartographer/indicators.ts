/**
 * Cartographer indicators — pure data sets used to detect a project root and to
 * exclude noise directories when walking a tree. Ports the constant tables from
 * `generate_project_map.py` / `write_recursive.py`.
 */

/** Filenames whose presence marks a directory as a project root. */
export const PROJECT_INDICATORS: ReadonlySet<string> = new Set([
  "package.json", "deno.json", "bun.lockb", "bun.lock", "tsconfig.json",
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "composer.json", "artisan", "Cargo.toml", "rust-toolchain.toml", "go.mod",
  "pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "requirements.txt",
  "environment.yml", "Gemfile", "Package.swift", "Podfile", "pubspec.yaml",
  "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "build.sbt",
  "Makefile", "CMakeLists.txt", "meson.build", "configure.ac",
  "Directory.Build.props", "global.json", "mix.exs", "rebar.config",
  "project.clj", "deps.edn", "stack.yaml", "cabal.project", "dune-project",
  "build.zig", "gleam.toml", "v.mod", "Project.toml", "DESCRIPTION", "cpanfile",
  "Makefile.PL", ".luacheckrc", "astro.config.mjs", "next.config.js",
  "next.config.mjs", "nuxt.config.ts", "vite.config.ts", "next.config.ts",
  "angular.json", "svelte.config.js", "svelte.config.ts", "main.tf",
  "ansible.cfg", "pulumi.yaml", "cdk.json", "Chart.yaml", "wrangler.toml",
  "fly.toml", "turbo.json", "nx.json", "BUILD", "WORKSPACE", "Justfile",
  "Taskfile.yml", "docker-compose.yml", "docker-compose.yaml", "compose.yml",
  "compose.yaml", "Dockerfile", ".git",
]);

/** Directory names skipped entirely during the tree walk. */
export const EXCLUDE_DIRS: ReadonlySet<string> = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build", ".output",
  "vendor", "__pycache__", ".venv", "venv", ".cartographer", ".claude",
  ".ruff_cache", ".DS_Store", "coverage", ".turbo", ".vercel", ".netlify",
  "Pods", "DerivedData", ".build", ".swiftpm",
]);
