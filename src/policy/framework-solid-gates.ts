import { resolveMaxLines } from "../config/limits";
import { countFrameworkCodeLines } from "./file-size";
import { moduleAwarePath } from "./module-layout";
import { maskCommentsAndStrings, maskCommentsOnly } from "./conventions/strip";
import { isStoreOrQueryDefinition } from "./conventions/store-or-query";

/** Custom hook export (React): `export function/const use[A-Z]`. */
const HOOK_RE: RegExp = /^export (function|const) use[A-Z]/m;
/** Top-level TS interface/type declaration. */
const TS_DECL_RE: RegExp = /^(export )?(interface|type) [A-Z]/m;
/** Client-only React hooks that require the `'use client'` directive. */
const CLIENT_HOOK_RE: RegExp = /\b(useState|useEffect|useRef|onClick|onChange)\b/;
/** PHP top-level `interface` declaration. */
const PHP_INTERFACE_RE: RegExp = /^interface /m;
/** Swift top-level `protocol` declaration. */
const SWIFT_PROTOCOL_RE: RegExp = /^protocol /m;
/** Swift type declaration (`class`/`struct`) opening a body. */
const SWIFT_TYPE_RE: RegExp = /^(class|struct) [^\n{]* \{/m;

/** React: line limit, interface separation, custom hooks under `/hooks/`. */
export function reactGate(filePath: string, content: string, fileLines?: number): string[] {
  const v: string[] = [];
  const raw = content; // store/query detectors probe raw imports (F0.1)
  content = maskCommentsAndStrings(content, "c");
  const max = resolveMaxLines();
  const lines = fileLines ?? countFrameworkCodeLines(content);
  if (lines > max) v.push(`File has ${lines} lines (limit: ${max}). Split to hooks/, components/, or utils/.`);
  if (filePath.includes("/components/") && TS_DECL_RE.test(content)) {
    const dest = moduleAwarePath(filePath, "src/interfaces/", "src/interfaces/ or src/types/");
    v.push(`Interface/type in component. Move to ${dest}.`);
  }
  // Store/query-definition files are NOT hooks: the legacy hook rule would
  // hard-deny `useXStore`/`useUsers` into hooks/, shadowing the store/query
  // conventions (owner E1/E5). The exemption itself is signature+cap gated
  // (owner F0.2): no real import / no `@tanstack/*-query` dep → hook rule
  // fires as before, byte-identical.
  if (HOOK_RE.test(content) && !filePath.includes("/hooks/") && !isStoreOrQueryDefinition(filePath, raw))
    v.push("Custom hook defined outside hooks/ directory. Move to hooks/.");
  return v;
}

/** Next.js: adaptive line limit, interface separation, `'use client'`. */
export function nextGate(filePath: string, content: string, fileLines?: number): string[] {
  const v: string[] = [];
  const raw = content; // the directive is a string literal — masking blanks it (F1.1)
  content = maskCommentsAndStrings(content, "c");
  const base = resolveMaxLines();
  const max = /(page|layout|loading|error|not-found)\.(tsx|ts)$/.test(filePath) ? base + 50 : base;
  const lines = fileLines ?? countFrameworkCodeLines(content);
  if (lines > max) v.push(`File has ${lines} lines (limit: ${max}). Split to lib/, hooks/, or components/.`);
  if (/\/(app|components|modules)\//.test(filePath) && !filePath.includes("/interfaces/") && TS_DECL_RE.test(content)) {
    const dest = moduleAwarePath(filePath, "src/interfaces/", "src/interfaces/");
    v.push(`Interface/type in component. Move to ${dest}.`);
  }
  if (CLIENT_HOOK_RE.test(content)) {
    // Directive check on comment-masked content only: a `// "use client"`
    // comment is NOT a directive, but the real string literal stays readable.
    const head = maskCommentsOnly(raw, "c").split("\n").slice(0, 5).join("\n");
    if (!head.includes("'use client'") && !head.includes('"use client"'))
      v.push("Client hooks detected but 'use client' directive missing at top.");
  }
  return v;
}

/** Laravel/PHP: line limit, interface outside `/Contracts/`, fat controller (>80). */
export function laravelGate(filePath: string, content: string, fileLines?: number): string[] {
  const v: string[] = [];
  content = maskCommentsAndStrings(content, "php");
  const lines = fileLines ?? countFrameworkCodeLines(content);
  const max = resolveMaxLines();
  if (lines > max) v.push(`File has ${lines} lines (limit: ${max}). Split using Services, Actions, or Traits.`);
  if (PHP_INTERFACE_RE.test(content) && !filePath.includes("/Contracts/")) {
    const dest = moduleAwarePath(filePath, "Contracts/", "app/Contracts/ or FuseCore/{Module}/App/Contracts/");
    v.push(`Interface defined outside Contracts/. Move to ${dest}.`);
  }
  if (filePath.includes("/Controllers/") && lines > 80)
    v.push(`Fat controller (${lines} lines). Extract logic to Services or Actions.`);
  return v;
}

/** Swift: adaptive limit, protocol separation, @MainActor, Sendable. */
export function swiftGate(filePath: string, content: string, fileLines?: number): string[] {
  const v: string[] = [];
  content = maskCommentsAndStrings(content, "c");
  const base = resolveMaxLines();
  const max = /(View|Screen)\.swift$/.test(filePath) ? base + 50 : base;
  const lines = fileLines ?? countFrameworkCodeLines(content);
  if (lines > max) v.push(`File has ${lines} lines (limit: ${max}). Extract to ViewModels, Services, or subviews.`);
  if (SWIFT_PROTOCOL_RE.test(content) && !filePath.includes("/Protocols/")) {
    const dest = moduleAwarePath(filePath, "Protocols/", "Protocols/ directory");
    v.push(`Protocol defined outside Protocols/ directory. Move to ${dest}.`);
  }
  if (filePath.endsWith("ViewModel.swift") && !content.includes("@MainActor"))
    v.push("ViewModel missing @MainActor annotation.");
  if (SWIFT_TYPE_RE.test(content) && content.includes("async ") && !content.includes("Sendable"))
    v.push("Type uses async but doesn't conform to Sendable.");
  return v;
}
