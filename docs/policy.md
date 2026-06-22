# policy — evaluation & guards

`import { evaluate, evaluateFileSize, detectProjectType, detectFramework } from "@fusengine/harness/policy";`

The harness-agnostic decision layer. Pure functions — no I/O, no harness coupling.

## `evaluate(ctx): PolicyResult`

The unified entry point. Adapters call this and translate the result.

```ts
interface PolicyContext {
  tool: string;          // "Write" | "Edit" | "Bash" | ...
  filePath?: string;
  content?: string;
  command?: string;      // for Bash tools
  maxLines?: number;     // override SOLID limit
}
interface PolicyResult {
  decision: "allow" | "deny" | "warn";
  message: string | null;
  meta?: Record<string, unknown>;
}
```

Current policies, in order:
1. **git guard** — `command` matching `GIT_BLOCKED` → `deny`.
2. **file-size** — a code `filePath` whose `content` exceeds the SOLID limit →
   `deny` (with `meta.framework`, `meta.lines`, `meta.max`).
3. otherwise `allow`.

```ts
const r = evaluate({ tool: "Write", filePath: "src/big.ts", content });
if (r.decision === "deny") report(r.message);
```

## Building blocks

| Export | Description |
|--------|-------------|
| `evaluateFileSize(lines, max?)` | `{ ok, lines, max, message }` against the SOLID limit |
| `countLines(content)` | line count (empty = 0) |
| `detectProjectType(dir)` | framework from config files on disk (15 types) |
| `detectFramework(path, content)` | framework from extension + content patterns |
| `DEV_KEYWORDS`, `isApexCommand(prompt)` | dev-task / `/apex` detection |
| `GIT_BLOCKED`, `GIT_ASK`, `SYSTEM_INSTALL`, `PROJECT_INSTALL` | `RegExp[]` guard data (verbatim from the fusengine guards) |
| `matchPatterns(cmd, patterns)` | `true` if any pattern matches |

> Faithful note: `GIT_BLOCKED`'s `git push.*--force` also matches
> `--force-with-lease` — preserved from the source guard.
