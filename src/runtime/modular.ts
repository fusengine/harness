import { existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type { Prompt } from "../prompt/types";
import { detectModularArchitecture } from "../policy/detect-project";

const NEXT_CONVENTION = /^(page|layout|loading|error|not-found|route|template|default|global-error|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest|middleware)\.(tsx|ts|js|jsx)$/;
const NEXT_STATIC = /\.(css|ico|png|jpg|svg|json)$/;
const PHP_BLOCKED_IN_APP: readonly string[] = [
  "/app/Models/", "/app/Services/", "/app/Actions/", "/app/Http/Controllers/",
  "/app/Http/Requests/", "/app/Http/Resources/", "/app/Contracts/", "/app/DTOs/",
  "/app/Repositories/", "/app/Events/", "/app/Listeners/", "/app/Jobs/",
  "/app/Notifications/", "/app/Policies/",
];

const block = (reason: string): Prompt => ({
  kind: "block", title: "Modular architecture", reason,
  actions: ["Move the code into the correct feature module", "Import only from the shared core module"],
});

/** Next.js `modules/` architecture: `app/` convention + cross-module import rules. */
function nextModular(filePath: string, content: string, cwd: string): Prompt | null {
  const rel = relative(cwd, filePath);
  const bn = basename(filePath);
  if ((rel.startsWith("app/") || rel.startsWith("src/app/")) && !NEXT_CONVENTION.test(bn) && !NEXT_STATIC.test(bn)) {
    return block(`BLOCKED: modular Next.js — '${bn}' is not an app/ convention file. Move business logic to modules/[feature]/.`);
  }
  const mod = filePath.match(/\/modules\/([^/]+)\//);
  if (!mod) return null;
  const current = mod[1] ?? "";
  for (const m of content.matchAll(/from\s+['"][@.][^'"]*?\/modules\/([^/]+)\//g)) {
    const imported = m[1] ?? "";
    if (current === "cores") {
      if (imported !== "cores" && imported !== "core") return block(`BLOCKED: modules/cores/ must not import from modules/${imported}/.`);
    } else if (imported !== current && imported !== "cores" && imported !== "core") {
      return block(`BLOCKED: cross-module import — '${current}' imports '${imported}'. Only modules/cores/ is shared.`);
    }
  }
  return null;
}

/** Laravel FuseCore architecture: `app/` domain ban + module.json + cross-module `use` rules. */
function fusecore(filePath: string, content: string, cwd: string): Prompt | null {
  for (const b of PHP_BLOCKED_IN_APP) if (filePath.includes(b)) return block(`BLOCKED: FuseCore — domain code in '${b}' must move to FuseCore/{Module}/App/.`);
  const mod = filePath.match(/\/FuseCore\/([A-Za-z]+)\//);
  if (!mod) return null;
  const name = mod[1] ?? "";
  if (!existsSync(join(cwd, "FuseCore", name, "module.json"))) return block(`BLOCKED: FuseCore module '${name}' is missing module.json — create it first.`);
  for (const m of content.matchAll(/use\s+FuseCore\\(\w+)\\/g)) {
    const imported = m[1] ?? "";
    if (name === "Core") {
      if (imported !== "Core") return block(`BLOCKED: FuseCore\\Core\\ must not use FuseCore\\${imported}\\.`);
    } else if (imported !== name && imported !== "Core") {
      return block(`BLOCKED: cross-module use — '${name}' uses '${imported}'. Only FuseCore\\Core\\ is shared.`);
    }
  }
  return null;
}

/** Enforce the project's modular architecture (Next.js `modules/` or Laravel FuseCore) on a Write/Edit. */
export function modularGate(tool: string, filePath: string | undefined, content: string | undefined, cwd: string | undefined): Prompt | null {
  if ((tool !== "Write" && tool !== "Edit") || !filePath || !cwd) return null;
  if (/\/(node_modules|dist|build|\.next|vendor|storage)\//.test(filePath)) return null;
  const arch = detectModularArchitecture(cwd);
  if (arch === "nextjs-modular" && /\.(tsx|ts|jsx|js)$/.test(filePath)) return nextModular(filePath, content ?? "", cwd);
  if (arch === "fusecore" && filePath.endsWith(".php")) return fusecore(filePath, content ?? "", cwd);
  return null;
}
