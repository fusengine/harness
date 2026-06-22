# Guards — `@fusengine/harness/policy`

Ten portable enforcement guards, composed into `evaluate()` via a
`runGuards` chain (first firing guard wins, ahead of git + file-size). Each is a
pure `(ctx: GuardContext) => Prompt | null`.

```ts
import { runGuards, type GuardContext } from "@fusengine/harness/policy";

const hit = runGuards({ tool: "Bash", command: "rm -rf /" });
// → { kind: "block", title: "Dangerous command", reason: "...", actions: [...] }
```

`GuardContext` is `{ tool, filePath?, content?, command? }`. A guard returns a
portable `Prompt` (`kind: "block" | "ask" | "inform"`) or `null` to continue.

## The chain (evaluation order)

| Guard | Fires when | kind |
|-------|-----------|------|
| `securityGuard` | `rm -rf /`, fork bomb, `curl \| sh`, `mkfs`, disk overwrite | block |
| | `sudo`, `chmod 777`, recursive `chown`, `eval`, write to `/etc` | ask |
| `protectedPathGuard` | Write/Edit under `.claude/plugins\|logs\|cache`, `.git/` | block |
| `bashWriteGuard` | `python3 -c`, `sed -i`, heredoc/redirect to a code file | block |
| | redirect to a non-code file, `tee`, `dd of=`, `node -e` writes | ask |
| `interfaceSeparationGuard` | top-level `interface`/`type`/`protocol` in a component/view/controller | block |
| `installGuard` | `npm/yarn/pnpm/bun/pip/cargo/go/gem/composer` + `brew/apt/...` installs | ask |

Plus, inside `evaluate()` after the chain: **git** (destructive git commands)
and **file-size** (a code file over `FUSE_SOLID_MAX_LINES`).

## APEX gates (stateful)

The gates in `policy/apex` need session state (supplied by `runtime`): they form
their own chain via `evaluateApex(ctx)`:

| Gate | Blocks until |
|------|-------------|
| `brainstormGate` | brainstorming ran (when creation intent flagged a new file) |
| `freshnessGate` | `explore-codebase` + `research-expert` ran within the window |
| `docConsultedGate` | Context7 **and** Exa consulted this session |
| `solidReadGate` | the routed SOLID refs (`FUSE_HARNESS_REFS`) were read |

Each is individually exported and overridable — pass your own array to
`evaluateApex(ctx, gates)`.
