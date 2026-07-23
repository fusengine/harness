/**
 * Extended interface-syntax violations (owner E3, advisory-first): the
 * syntaxes the guard's legacy regexes miss — Swift `public protocol`,
 * Java/Kotlin `sealed`/`fun interface`, Go unexported top-level interface
 * (`type foo interface {` at column 0 — indented locals stay excluded, D0.2
 * invariant). Detection rides the conventions module on MASKED content; the
 * caller wraps the verdict with `rolloutVerdict`, so these surface as
 * `inform` until `FUSE_CONVENTIONS_MODE=deny`. Legacy cases never reach this
 * file (the guard's hard-deny branches return first).
 */
import { declaresInterface } from "../conventions/interfaces";
import { maskCommentsAndStrings } from "../conventions/strip";
import { langOfPath, lexProfileOf } from "../conventions/langs";

/** Legacy anchors (kept in sync with interface-separation.ts by test). */
const SWIFT_LEGACY_RE = /^\s*protocol\s+[A-Z]/m;
const JAVA_LEGACY_RE = /^\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:interface|record)\s+[A-Z]/m;
const GO_LEGACY_RE = /^\s*type\s+[A-Z]\w*\s+interface\b/m;

const inAny = (path: string, ...frags: string[]): boolean => frags.some((f) => path.includes(f));

/**
 * The extended-syntax violation for a file, or null when clean/legacy.
 * @param path - The written/edited file's path.
 * @param content - Its raw content (masked internally).
 * @returns Message + action for the advisory prompt.
 */
export function extendedInterfaceViolation(path: string, content: string): { msg: string; action: string } | null {
  if (!declaresInterface(path, content)) return null;
  const masked = maskCommentsAndStrings(content, lexProfileOf(langOfPath(path) ?? "ts"));
  if (/\.swift$/.test(path) && inAny(path, "View/", "Views/", "Component/", "Components/") && !SWIFT_LEGACY_RE.test(masked)) {
    return { msg: "Protocol in view file. Move to Sources/Interfaces/", action: "Move the protocol to Sources/Interfaces/" };
  }
  if (/\.(java|kt)$/.test(path) && inAny(path, "controller/", "controllers/", "handler/", "handlers/") && !JAVA_LEGACY_RE.test(masked)) {
    return { msg: "Interface in controller file. Move to interfaces/ package", action: "Move the interface to the interfaces/ package" };
  }
  if (/\.go$/.test(path) && inAny(path, "handler/", "handlers/", "controller/", "controllers/") && !GO_LEGACY_RE.test(masked)) {
    return { msg: "Interface in handler file. Move to internal/interfaces/", action: "Move the interface to internal/interfaces/" };
  }
  return null;
}
