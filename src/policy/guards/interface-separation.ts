import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";
import { moduleAwarePath } from "../module-layout";
import { maskCommentsAndStrings } from "../conventions/strip";
import { langOfPath, lexProfileOf } from "../conventions/langs";
import { declaresExportedTypeAlias } from "../conventions/interfaces";
import { rolloutVerdict } from "../conventions/verdict";
import { extendedInterfaceViolation } from "./interface-separation-ext";

/** TS/JS component files: top-level `interface`/`type Foo`. */
export const TS_DECL_RE: RegExp = /^\s*(export\s+)?(interface|type)\s+[A-Z]/m;
/** Python view models: class subclassing a schema/protocol base. */
export const PY_MODEL_RE: RegExp = /^\s*class\s+\w+\s*\([^)]*\b(?:BaseModel|TypedDict|Protocol)\b/m;
/**
 * PHP controllers: top-level `interface`, `abstract class`, or a concrete
 * `class …Interface/DTO/Request`. Union of the TS-only `abstract class` rule
 * and the Python rule (`class [A-Z].*(Interface|DTO|Request)`, enforce-interfaces.py:16).
 */
export const PHP_DECL_RE: RegExp = /^\s*(?:abstract\s+class\b|interface\b|class\s+[A-Z].*(?:Interface|DTO|Request))/m;
/** Swift views: top-level `protocol Foo`. */
export const SWIFT_PROTO_RE: RegExp = /^\s*protocol\s+[A-Z]/m;
/** Go handlers/controllers: top-level `type Foo interface`. */
export const GO_DECL_RE: RegExp = /^\s*type\s+[A-Z]\w*\s+interface\b/m;
/** Java/Kotlin controllers/handlers: top-level `interface`/`record`. */
export const JAVA_DECL_RE: RegExp = /^\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:interface|record)\s+[A-Z]/m;
/** Rust: top-level `trait Foo` declaration (captures the name for impl co-location). */
export const RUST_DECL_RE: RegExp = /^\s*(?:pub(?:\(\w+\))?\s+)?trait\s+([A-Z]\w*)/m;

/**
 * Blocks top-level interface/type/protocol declarations in component, view or
 * controller files (Interface Segregation), when BOTH the path category AND
 * the content pattern match. Content is MASKED first (conventions/strip.ts):
 * declarations in comments/strings/templates/heredocs never trigger. Legacy
 * regexes keep their exact values (parity tests) — every case that blocked
 * before still blocks with the same message (byte-parity). Two extension
 * classes ship ADVISORY via {@link rolloutVerdict} (`FUSE_CONVENTIONS_MODE`,
 * Amendment 5): exported type aliases redirected to `src/types/` (Amendment 2),
 * and the widenings of `interface-separation-ext.ts` (public protocol,
 * sealed/fun interface, unexported Go top-level). Rust `impl<T>` stays a
 * known FN. Parity: the Python port inspected `Write` only; we also fire on
 * `Edit`, and fragments accept singular+plural dirs (`view/` + `views/`).
 */
export function interfaceSeparationGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Write" && ctx.tool !== "Edit") return null;
  const path: string | undefined = ctx.filePath;
  const content: string | undefined = ctx.content;
  if (!path || !content) return null;
  const lang = langOfPath(path);
  const masked = maskCommentsAndStrings(content, lexProfileOf(lang ?? "ts"));

  const blockWith = (msg: string, action: string): Prompt => ({
    kind: "block",
    title: "Separate the interface",
    reason: `SOLID VIOLATION: ${msg}`,
    actions: [action],
  });

  const inAny = (...frags: string[]): boolean =>
    // Segment-anchored: `view/` must be a real dir — `overview/`, `livetest-app/`
    // never match (same FP class as solid-transcript G3); fragment at path start OK.
    frags.some((f) => path.includes(`/${f}`) || path.startsWith(f));
  if (/\.(tsx|jsx|vue|svelte)$/.test(path) && TS_DECL_RE.test(masked)) {
    if (!/^\s*(export\s+)?(declare\s+)?interface\s+\w/.test(masked) && declaresExportedTypeAlias(content)) {
      return rolloutVerdict(blockWith(
        "Type alias in component file. Move to modules/[feature]/src/types/",
        "Move the type alias to modules/[feature]/src/types/",
      ), true);
    }
    return blockWith(
      "Interface/type in component file. Move to modules/[feature]/src/interfaces/",
      "Move the interface/type to modules/[feature]/src/interfaces/",
    );
  }
  if (/\.py$/.test(path) && inAny("view/", "views/", "controller/", "controllers/", "route/", "routes/") && PY_MODEL_RE.test(masked)) {
    return blockWith("Type class in view file. Move to src/interfaces/", "Move the type class to src/interfaces/");
  }
  if (/\.go$/.test(path) && inAny("handler/", "handlers/", "controller/", "controllers/") && GO_DECL_RE.test(masked)) {
    return blockWith("Interface in handler file. Move to internal/interfaces/", "Move the interface to internal/interfaces/");
  }
  if (/\.(java|kt)$/.test(path) && inAny("controller/", "controllers/", "handler/", "handlers/") && JAVA_DECL_RE.test(masked)) {
    return blockWith("Interface in controller file. Move to interfaces/ package", "Move the interface to the interfaces/ package");
  }
  if (/\.php$/.test(path) && inAny("Controller/", "Controllers/", "Handler/", "Handlers/") && PHP_DECL_RE.test(masked)) {
    return blockWith("Interface in controller file. Move to app/Contracts/", "Move the interface to app/Contracts/");
  }
  if (/\.swift$/.test(path) && inAny("View/", "Views/", "Component/", "Components/") && SWIFT_PROTO_RE.test(masked)) {
    return blockWith("Protocol in view file. Move to Sources/Interfaces/", "Move the protocol to Sources/Interfaces/");
  }
  if (/\.rs$/.test(path) && !inAny("traits/", "interfaces/") && !path.endsWith("traits.rs")) {
    const m = RUST_DECL_RE.exec(masked);
    const name = m?.[1];
    if (name && new RegExp(`impl\\s+${name}\\s+for\\s+\\w+`).test(masked)) {
      const dest = moduleAwarePath(path, "traits.rs", "a dedicated traits.rs / interfaces module");
      return blockWith(`Trait declared alongside its implementation. Move the trait to ${dest}`, `Move the trait to ${dest}`);
    }
  }
  const ext = extendedInterfaceViolation(path, content);
  if (ext) return rolloutVerdict(blockWith(ext.msg, ext.action), true);
  return null;
}
