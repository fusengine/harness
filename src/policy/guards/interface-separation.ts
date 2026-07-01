import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** TS/JS component files: top-level `interface`/`type Foo`. */
export const TS_DECL_RE: RegExp = /^\s*(export\s+)?(interface|type)\s+[A-Z]/m;
/** Python view models: class subclassing a schema/protocol base. */
export const PY_MODEL_RE: RegExp = /^\s*class\s+\w+\((BaseModel|TypedDict|Protocol)\)/m;
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

/**
 * Blocks top-level interface/type/protocol declarations in component, view or
 * controller files (Interface Segregation). Fires only when BOTH the path
 * category AND the content pattern match.
 *
 * Destination text for TS/JS/Vue/Svelte, PHP and Swift matches the user's own
 * `claude-rules/rules/04-solid-dry-rules.md` ("SOLID Skill per Stack" table),
 * the current authoritative convention — NOT the older `enforce-interfaces.py`
 * text, which this guard originally ported. Go/Python/Java/Kotlin aren't
 * covered by that table, so their destinations stay as a reasonable default.
 *
 * Parity note: enforce-interfaces.py only inspects `Write` (tool_input.content).
 * We deliberately also fire on `Edit` — an in-place edit can introduce the same
 * violation — and the path fragments accept singular *and* plural directory
 * names (`view/` + `views/`), mirroring the Python `s?` regexes.
 */
export function interfaceSeparationGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Write" && ctx.tool !== "Edit") return null;
  const path: string | undefined = ctx.filePath;
  const content: string | undefined = ctx.content;
  if (!path || !content) return null;

  const blockWith = (msg: string, action: string): Prompt => ({
    kind: "block",
    title: "Separate the interface",
    reason: `SOLID VIOLATION: ${msg}`,
    actions: [action],
  });

  const inAny = (...frags: string[]): boolean => frags.some((f) => path.includes(f));
  if (/\.(tsx|jsx|vue|svelte)$/.test(path) && TS_DECL_RE.test(content)) {
    return blockWith(
      "Interface/type in component file. Move to modules/[feature]/src/interfaces/",
      "Move the interface/type to modules/[feature]/src/interfaces/",
    );
  }
  if (/\.py$/.test(path) && inAny("view/", "views/", "controller/", "controllers/", "route/", "routes/") && PY_MODEL_RE.test(content)) {
    return blockWith("Type class in view file. Move to src/interfaces/", "Move the type class to src/interfaces/");
  }
  if (/\.go$/.test(path) && inAny("handler/", "handlers/", "controller/", "controllers/") && GO_DECL_RE.test(content)) {
    return blockWith("Interface in handler file. Move to internal/interfaces/", "Move the interface to internal/interfaces/");
  }
  if (/\.(java|kt)$/.test(path) && inAny("controller/", "controllers/", "handler/", "handlers/") && JAVA_DECL_RE.test(content)) {
    return blockWith("Interface in controller file. Move to interfaces/ package", "Move the interface to the interfaces/ package");
  }
  if (/\.php$/.test(path) && inAny("Controller/", "Controllers/", "Handler/", "Handlers/") && PHP_DECL_RE.test(content)) {
    return blockWith("Interface in controller file. Move to app/Contracts/", "Move the interface to app/Contracts/");
  }
  if (/\.swift$/.test(path) && inAny("View/", "Views/", "Component/", "Components/") && SWIFT_PROTO_RE.test(content)) {
    return blockWith("Protocol in view file. Move to Sources/Interfaces/", "Move the protocol to Sources/Interfaces/");
  }
  return null;
}
