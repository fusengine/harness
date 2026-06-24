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

**Extensible + fail-closed.** `registerGuard(fn)` adds a user guard that runs
**after** the privileged core chain (two-tier — the core can't be bypassed; use
`clearUserGuards()` to reset). `runGuards` is **fail-closed**: a guard that throws
returns a block (`FAIL_CLOSED`), never a silent pass — and the runtime `gate`
wraps `evaluate`/`evaluateApex` the same way, so a bug can never disable enforcement.

## The chain (evaluation order)

| Guard | Fires when | kind |
|-------|-----------|------|
| `securityGuard` | `rm -rf /\|/etc\|/usr…`, fork bomb, `curl \| sh`, `mkfs`/`shred`/`fdisk`/`diskutil erase`, `> /dev/{sda,hda,nvme}` | block |
| | `sudo`/`su`/`doas`/`passwd`, `chmod 777`, recursive `chown`, `eval`, `rm`/`unlink`, write to `/etc` | ask |
| `protectedPathGuard` | Write/Edit under `.claude/plugins\|logs\|cache`, `.git/` | block |
| `bashWriteGuard` | `python3 -c`, `sed -i`, heredoc/redirect to a code file | block |
| | redirect to a non-code file, `tee`, `dd of=`, `node -e` writes | ask |
| `interfaceSeparationGuard` | top-level `interface`/`type`/`protocol`/`record` in a TS/JS/Vue/Svelte, Python, **Go**, **Java/Kotlin**, PHP, or Swift component/view/controller/handler | block |
| `installGuard` | `npm/yarn/pnpm/bun/pip/cargo/go/gem/composer` + `brew/apt/dnf/pacman` installs | ask |

Plus, inside `evaluate()` after the chain:
- **git** — destructive ops (`push --force`, `reset --hard`, `branch -D`…) → **block**;
  routine ops (`push`, `checkout`, `commit`, `add`, `branch -d`, `merge`…) → **ask**.
- **file-size** — over `FUSE_SOLID_MAX_LINES` (default 100). A **Write** judges its
  new content; an **Edit** judges the existing on-disk file. `Explore`/`Plan` agents are exempt.
- **verbosity** (`capVerbosity`) — caps exa `numResults`≤3 + `tokensNum`≤2000 and
  Context7 `tokens`≤2000 (applied as an input mutation, not a block).

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
