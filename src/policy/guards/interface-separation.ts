import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** TS/JS component files: top-level `interface`/`type Foo`. */
export const TS_DECL_RE: RegExp = /^\s*(export\s+)?(interface|type)\s+[A-Z]/m;
/** Python view models: class subclassing a schema/protocol base. */
export const PY_MODEL_RE: RegExp = /^\s*class\s+\w+\((BaseModel|TypedDict|Protocol)\)/m;
/** PHP controllers: top-level `interface` / `abstract class`. */
export const PHP_DECL_RE: RegExp = /^\s*(interface|abstract class)\b/m;
/** Swift views: top-level `protocol Foo`. */
export const SWIFT_PROTO_RE: RegExp = /^\s*protocol\s+[A-Z]/m;
/** Go handlers/controllers: top-level `type Foo interface`. */
export const GO_DECL_RE: RegExp = /^\s*type\s+[A-Z]\w*\s+interface\b/m;
/** Java/Kotlin controllers/handlers: top-level `interface`/`record`. */
export const JAVA_DECL_RE: RegExp = /^\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:interface|record)\s+[A-Z]/m;

/**
 * Blocks top-level interface/type/protocol declarations in component, view or
 * controller files (Interface Segregation). Fires only when BOTH the path
 * category AND the content pattern match.
 */
export function interfaceSeparationGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Write" && ctx.tool !== "Edit") return null;
  const path: string | undefined = ctx.filePath;
  const content: string | undefined = ctx.content;
  if (!path || !content) return null;

  const block: Prompt = {
    kind: "block",
    title: "Separate the interface",
    reason: "Top-level interface/type/protocol declarations belong in their own file, not in a component/view/controller.",
    actions: ["Move the interface/type to its own file (Interface Segregation)"],
  };

  const inAny = (...frags: string[]): boolean => frags.some((f) => path.includes(f));
  if (/\.(tsx|jsx|vue|svelte)$/.test(path) && TS_DECL_RE.test(content)) return block;
  if (/\.py$/.test(path) && inAny("views/", "controllers/", "routes/") && PY_MODEL_RE.test(content)) return block;
  if (/\.go$/.test(path) && inAny("handlers/", "controllers/") && GO_DECL_RE.test(content)) return block;
  if (/\.(java|kt)$/.test(path) && inAny("controllers/", "handlers/") && JAVA_DECL_RE.test(content)) return block;
  if (/\.php$/.test(path) && inAny("Controllers/", "Handlers/") && PHP_DECL_RE.test(content)) return block;
  if (/\.swift$/.test(path) && inAny("Views/", "Components/") && SWIFT_PROTO_RE.test(content)) return block;
  return null;
}
