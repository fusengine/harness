import { resolveMaxLines } from "../config/limits";
import { countFrameworkCodeLines } from "./file-size";
import { moduleAwarePath } from "./module-layout";

/**
 * Systems-language SOLID gates (Go, Rust). Split out of `framework-solid-gates.ts`
 * to stay under the SOLID line ceiling — the JS/framework gates already sit
 * near it, and Go/Rust share no logic with React/Next/Laravel/Swift beyond the
 * `moduleAwarePath` helper.
 */

/** Go top-level `type Foo interface` declaration. */
const GO_INTERFACE_DECL_RE: RegExp = /^type\s+[A-Z]\w*\s+interface\b/m;
/** Go method with a (pointer) receiver: `func (r *Foo) Bar(...)` — receiver type may be unexported (`repo`), unlike the interface it implements. */
const GO_METHOD_RE: RegExp = /^func\s*\(\s*\w+\s+\*?[A-Za-z]\w*\)\s+\w+/m;
/** Rust top-level `trait Foo` declaration (captures the name for impl co-location). */
const RUST_TRAIT_DECL_RE: RegExp = /^(pub(\(\w+\))?\s+)?trait\s+([A-Z]\w*)/m;
/** Rust top-level `struct`/`enum`/`trait` declaration. */
const RUST_TYPE_DECL_RE: RegExp = /^(pub\s+)?(struct|enum|trait)\s+[A-Z]/m;
/** Rust top-level `impl` block. */
const RUST_IMPL_RE: RegExp = /^(pub\s+)?impl\b/m;
/** Rust `unsafe fn/impl/trait/{` usage. */
const RUST_UNSAFE_RE: RegExp = /\bunsafe\s*(fn|impl|trait|\{)/;
/** `// SAFETY:` justification comment (case-insensitive). */
const RUST_SAFETY_COMMENT_RE: RegExp = /\/\/\s*SAFETY:/i;
/** Rust entry-point file: `main.rs`. */
const RUST_MAIN_RE: RegExp = /(^|\/)main\.rs$/;
/** Rust `src/bin/*.rs` binary target. */
const RUST_BIN_RE: RegExp = /\/bin\/[^/]+\.rs$/;
/** A single top-level `struct`/`enum` declaration (used for the clap-Args exemption). */
const RUST_STRUCT_ENUM_RE: RegExp = /^(pub\s+)?(struct|enum)\s+[A-Z]\w*/gm;
/** clap `#[derive(...Parser...)]` attribute. */
const RUST_DERIVE_PARSER_RE: RegExp = /#\[derive\([^)]*Parser[^)]*\)\]/;

/** Go: line limit, interface co-located with its (pointer-receiver) implementation. */
export function goGate(filePath: string, content: string, fileLines?: number): string[] {
  const v: string[] = [];
  const max = resolveMaxLines();
  const lines = fileLines ?? countFrameworkCodeLines(content);
  if (lines > max) {
    const dest = moduleAwarePath(filePath, "{services,handlers}.go", "an internal/ package by responsibility");
    v.push(`File has ${lines} lines (limit: ${max}). Split into ${dest}.`);
  }
  const isExempt = filePath.endsWith("_test.go") || /\/mocks?\//.test(filePath) || /\/interfaces\//.test(filePath);
  if (!isExempt && GO_INTERFACE_DECL_RE.test(content) && GO_METHOD_RE.test(content)) {
    const dest = moduleAwarePath(filePath, "interfaces/", "internal/interfaces/ (consumer-side, Go idiom)");
    v.push(`Interface declared alongside its implementation. Move the interface to ${dest}.`);
  }
  return v;
}

/**
 * Whether `content`'s only top-level `struct`/`enum` is a clap `#[derive(...Parser...)]`
 * args struct — the god-main.rs check's sole exemption (a CLI entry point wiring
 * its own arg struct is not "business logic").
 */
function isClapArgsOnly(content: string): boolean {
  const matches = [...content.matchAll(RUST_STRUCT_ENUM_RE)];
  if (matches.length !== 1) return false;
  const idx = matches[0]?.index;
  if (idx === undefined) return false;
  const before = content.slice(0, idx).split("\n");
  for (let i = before.length - 1, checked = 0; i >= 0 && checked < 3; i--) {
    const line = (before[i] ?? "").trim();
    if (!line) continue;
    checked++;
    return RUST_DERIVE_PARSER_RE.test(line);
  }
  return false;
}

/** Rust: line limit, trait co-location, god-main.rs, unsafe without `// SAFETY:`. */
export function rustGate(filePath: string, content: string, fileLines?: number): string[] {
  const v: string[] = [];
  const max = resolveMaxLines();
  const lines = fileLines ?? countFrameworkCodeLines(content);
  if (lines > max) {
    const dest = moduleAwarePath(filePath, "{...}.rs", "mod.rs + submodules");
    v.push(`File has ${lines} lines (limit: ${max}). Split into ${dest}.`);
  }
  if (!/\/(traits|interfaces)\//.test(filePath) && !filePath.endsWith("traits.rs")) {
    const m = RUST_TRAIT_DECL_RE.exec(content);
    const name = m?.[3];
    if (name && new RegExp(`impl\\s+${name}\\s+for\\s+\\w+`).test(content)) {
      const dest = moduleAwarePath(filePath, "traits.rs", "a dedicated traits.rs / interfaces module");
      v.push(`Trait declared alongside its implementation. Move the trait to ${dest}.`);
    }
  }
  const isMain = RUST_MAIN_RE.test(filePath) || RUST_BIN_RE.test(filePath);
  if (isMain && (RUST_TYPE_DECL_RE.test(content) || RUST_IMPL_RE.test(content)) && !isClapArgsOnly(content))
    v.push("Entry point contains business logic — keep main.rs to wiring only (parse args, init, call lib.rs/app::run()).");
  if (RUST_UNSAFE_RE.test(content) && !RUST_SAFETY_COMMENT_RE.test(content))
    v.push("unsafe without a // SAFETY: comment. Justify the invariant above each unsafe block.");
  return v;
}
