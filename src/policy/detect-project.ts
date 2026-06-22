import { existsSync } from "node:fs";
import { join } from "node:path";

/** Project types detected from filesystem indicators. */
export type ProjectType =
  | "nextjs" | "nuxt" | "angular" | "svelte" | "vue" | "react" | "tailwind"
  | "laravel" | "rails" | "django" | "python" | "go" | "rust" | "swift"
  | "java" | "scala" | "elixir" | "ruby" | "generic";

/** Keywords that signal a development task (APEX trigger). */
export const DEV_KEYWORDS: RegExp =
  /\b(implement|create|build|fix|add|refactor|develop|feature|bug|update|modify|change|write|code)\b/i;

/** True when the prompt invokes the /apex command. */
export function isApexCommand(prompt: string): boolean {
  return /(?:^|\s)\/apex|\/fuse-ai-pilot:apex/i.test(prompt);
}

/** Detect the project type by scanning config files in `dir`. */
export function detectProjectType(dir: string): ProjectType {
  const has = (f: string): boolean => existsSync(join(dir, f));
  if (has("next.config.js") || has("next.config.ts") || has("next.config.mjs")) return "nextjs";
  if (has("nuxt.config.ts") || has("nuxt.config.js")) return "nuxt";
  if (has("angular.json")) return "angular";
  if (has("svelte.config.js") || has("svelte.config.ts")) return "svelte";
  if (has("vite.config.ts") && has("src/App.vue")) return "vue";
  if (has("vite.config.ts") || has("vite.config.js")) return "react";
  if (has("tailwind.config.js") || has("tailwind.config.ts")) return "tailwind";
  if (has("composer.json") && has("artisan")) return "laravel";
  if (has("Gemfile") && has("config/routes.rb")) return "rails";
  if (has("requirements.txt") || has("pyproject.toml") || has("setup.py")) {
    return has("manage.py") ? "django" : "python";
  }
  if (has("go.mod")) return "go";
  if (has("Cargo.toml")) return "rust";
  if (has("Package.swift")) return "swift";
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) return "java";
  if (has("build.sbt")) return "scala";
  if (has("mix.exs")) return "elixir";
  if (has("Gemfile")) return "ruby";
  return "generic";
}
