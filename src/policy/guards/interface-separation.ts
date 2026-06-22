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

  if (/\.(tsx|jsx|vue|svelte)$/.test(path) && TS_DECL_RE.test(content)) return block;
  if (path.includes("views/") && /\.py$/.test(path) && PY_MODEL_RE.test(content)) return block;
  if (path.includes("Controllers/") && /\.php$/.test(path) && PHP_DECL_RE.test(content)) return block;
  if (path.includes("Views/") && /\.swift$/.test(path) && SWIFT_PROTO_RE.test(content)) return block;
  return null;
}
