# @fusengine/harness

Harness-agnostic toolkit for AI coding agents. One package, modular subpaths,
**Bun-native** (the `exports` map points at the TypeScript source — no build step).

It splits cleanly into a **pure policy core** (no harness coupling) and **thin
adapters** that wire it into a specific harness's hook system.

## Why

The same guard logic (file-size limits, APEX freshness, framework detection,
git guards, project memory) was duplicated across Python + TypeScript hooks and
bound to one harness. This package is the single, tested source of truth — and
it knows which harness it's running in.

## Install

```sh
bun add @fusengine/harness
```

## Modules

| Subpath | What |
|---------|------|
| `@fusengine/harness/detect` | `detectHarness()` / `detectMode()` — Claude Code, Codex, Cursor, Cline, Gemini, opencode, Windsurf, Copilot, Aider, Kiro, Goose, Amp (env signals + `AGENT`/`AI_AGENT` standards). `mode` is `hook` or `cli`. |
| `@fusengine/harness/policy` | `evaluate(ctx)` → `{ decision, message }`; `evaluateFileSize`, `detectProjectType`, `detectFramework`, git/install guard patterns. |
| `@fusengine/harness/config` | `resolveTtlSec` / `resolveMaxLines` (env-driven, robust parse), `ttlLabel`, `splitTarget`. |
| `@fusengine/harness/memory` | Per-project "never reproduce" lessons: throttle state, multi-project registry by git root. |
| `@fusengine/harness/cache` | `compactMarkdown`, `queryHash`, `jaccardSimilar`, atomic JSON I/O, MCP response extraction. |
| `@fusengine/harness/freshness` | `isDocConsulted` (Context7 + Exa), trivial-edit counter. |
| `@fusengine/harness/refs` | Frontmatter parsing, glob→regex, SOLID reference scoring/routing. |
| `@fusengine/harness/state` | Directory locks, daily APEX state, task.json helpers. |
| `@fusengine/harness/statusline` | Formatters, ANSI colors, progress/gradient bars. |
| `@fusengine/harness/adapters/claude` | Claude Code adapter: read stdin → policy → `hookSpecificOutput`. |

## Usage

```ts
import { detectHarness, detectMode } from "@fusengine/harness/detect";
import { evaluate } from "@fusengine/harness/policy";

const { id, mode } = detectHarness();        // e.g. { id: "cursor", mode: "hook" }

const verdict = evaluate({ tool: "Write", filePath: "src/big.ts", content });
if (verdict.decision === "deny") console.error(verdict.message);
```

Claude Code hook (thin adapter):

```ts
import { readClaudeInput, fileSizeGuard } from "@fusengine/harness/adapters/claude";

const deny = fileSizeGuard(await readClaudeInput());
if (deny) { console.log(deny); process.exit(2); }
```

Harness without hooks (Aider/Windsurf/OpenHands) → `cli` mode: run the same
`evaluate()` from a pre-commit step instead.

## Develop

```sh
bun test          # test suite
bunx tsc --noEmit # typecheck
```

CI runs both on every PR. MIT licensed.
