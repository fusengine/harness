# @fusengine/harness

A **harness-agnostic enforcement engine** for AI coding agents. It ports the
guard/gate logic of a Claude Code plugin into one reusable, **Bun-native** npm
package that runs on **any** harness — Claude Code, OpenAI Codex, Cursor, Cline,
Gemini CLI — plus a cli-mode fallback for Aider / Windsurf / OpenHands.

It splits cleanly into a **pure policy core** (no harness coupling, fully tested)
and **thin per-harness adapters** that map a hook payload to the policy and back
to that harness's native response.

```
detect → init (pre+post hooks) → `harness hook` → guards + APEX gates → native deny/ask
```

## Install

```sh
npm i -g @fusengine/harness     # for the CLI (harness init/hook/check)
# or, as a library:
bun add @fusengine/harness      # Bun reads the TS source directly — no build step
```

## Quickstart

```sh
cd your-project
harness init                              # detects the harness, writes its pre+post hooks
# The SOLID-read gate auto-activates from discovered skills (default marketplace: fusengine-plugins).
export FUSE_HARNESS_MARKETPLACES=fusengine-plugins   # (optional) which marketplaces to auto-scan
export FUSE_HARNESS_REFS=.claude/skills              # (optional) explicit refs dir, overrides auto-discovery
```

That's it. `init` writes the wiring file for the detected harness
(`.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`,
`.gemini/settings.json`, or `.clinerules/hooks/PreToolUse`+`PostToolUse`), each
pointing at `harness hook <id>`. From then on every tool-use is gated, and the
session activity (agents run, docs consulted, refs read) is recorded
automatically under `<project>/.harness/` (track, cache, memory).

### CLI

| Command | What it does |
|---------|--------------|
| `harness init [id]` | Write the pre+post hook wiring for the detected (or named) harness. |
| `harness hook <id>` | Runtime: read a hook payload on stdin, gate (pre) or record (post), print the native response. (Hooks call this — you don't.) |
| `harness check` | cli-mode: check staged files in a pre-commit step, exit non-zero on a violation. For harnesses without hooks. |
| `harness doctor` | Print the version + resolved path of the harness *actually executing*, and compare it to npm's latest — the fast way to catch a stale global (see Pinning). |
| `harness --version` | Print the running version (bare, on stdout) and exit. |

Every invocation writes a `@fusengine/harness vX.Y.Z` banner to **stderr** (never
stdout — the hook JSON contract stays clean) so you can see which version ran.

cli-mode (Aider / Windsurf / OpenHands), as a pre-commit step:

```sh
# .husky/pre-commit
npx harness check
```

### Pinning (required for hook consumers)

Any consumer `hooks.json` / `settings.json` that runs the harness via `bunx`
**MUST pin an exact version** — `@fusengine/harness@X.Y.Z` — never a range
(`^` / `~`) and never the bare or `@latest` spec:

```jsonc
// .claude/settings.json — correct: exact pin
"command": "bunx @fusengine/harness@0.1.41 hook claude"
// WRONG — may silently keep running a stale global install:
"command": "bunx @fusengine/harness hook claude"
```

**Why.** A still-open bun bug ([oven-sh/bun#5791]) makes an unpinned `bunx <pkg>`
prefer an already-installed **global** copy over npm-latest, and publishing a new
version updates neither that global nor the bunx cache (`bun pm cache rm` does
**not** remove the global). A hook wired without an exact pin can therefore keep
executing an old harness indefinitely after you publish a fix — the failure is
silent because the smoke test (importing the local dist) never exercises the
`bunx`-resolved binary. Pinning `@X.Y.Z` forces the exact version to resolve.

Run `harness doctor` to see which version is actually executing and whether npm
has a newer one:

```sh
harness doctor
# @fusengine/harness doctor
#   running:    0.1.41
#   package:    /Users/you/.bun/install/global/node_modules/@fusengine/harness
#   runtime:    /Users/you/.bun/bin/bun
#   npm latest: 0.1.42
#   ! stale — npm serves 0.1.42. Pin "@fusengine/harness@0.1.42" in hooks.json.
```

If `doctor` reports a stale global, clear it and re-pin:

```sh
bun remove -g @fusengine/harness && bun pm cache rm
```

[oven-sh/bun#5791]: https://github.com/oven-sh/bun/issues/5791

## What it enforces

Ten portable guards + the APEX gate chain, all evaluated before a tool runs:

| Guard / gate | Fires on |
|---|---|
| file-size (SOLID) | a code file over `FUSE_SOLID_MAX_LINES` (default 100) |
| git | destructive git (`push --force`, `reset --hard`, …) |
| bash-write | `python3 -c` / `sed -i` / redirects to code files |
| install | `npm/pip/brew/...` installs (asks) |
| security | `rm -rf /`, fork bombs, `curl \| sh`; `sudo` (asks) |
| interface-separation | top-level interface/type/protocol in a component/controller |
| protected-path | edits to `.claude/plugins\|logs\|cache`, `.git/` |
| APEX freshness | `explore-codebase` + `research-expert` not run within the window |
| APEX doc-consulted | no doc source (Context7 / Exa / fuse-browser / WebSearch / WebFetch) consulted this session |
| APEX solid-read | required SOLID refs (auto-discovered, or `FUSE_HARNESS_REFS`) not read |
| framework sub-skill | framework / shadcn / Tailwind code whose required skill (`skills/<name>/`) wasn't read this session |
| Gemini MCP (opt-in) | hand-written Tailwind UI without a `mcp__gemini-design__*` call — only when `FUSE_ENFORCE_GEMINI_MCP` is set |
| brainstorm | creating a new file without brainstorming (when flagged) |
| MCP verbosity / cache | caps exa `numResults`; serves a fresh cached MCP/WebFetch result |

A trivial-edit fast path lets a few tiny (< 5-line, non-`replace_all`) edits
through per window without the full APEX gates.

### Environment

| Var | Effect |
|---|---|
| `FUSE_SOLID_MAX_LINES` | SOLID file-size limit (default `100`). |
| `FUSE_HARNESS_REFS` | Explicit `path.delimiter`-list of `.md` SOLID-reference dirs → activates `solidReadGate`. Overrides auto-discovery. |
| `FUSE_HARNESS_MARKETPLACES` | Comma-list of marketplace names whose `solid-*` skill refs are auto-discovered when `FUSE_HARNESS_REFS` is unset (default `fusengine-plugins`; an absent marketplace contributes nothing). Standalone `.claude`/`.codex`/`.cursor`/`.agents` skills are always scanned. |
| `FUSE_ENFORCE_TTL_SEC` | APEX freshness window in seconds. |
| `FUSE_LESSONS_THROTTLE_MIN` | Lessons-injection throttle (memory module). |
| `FUSE_ENFORCE_GEMINI_MCP` | **Opt-in (default off).** `1`/`true` blocks hand-written Tailwind UI (`.tsx/.jsx/.vue/.svelte`, ≥3 utility classes) until a `mcp__gemini-design__*` call is made this session. Read fresh per call. |
| `RALPH_MODE` | **Opt-in (default off).** `1`/`true` enables autonomous "Ralph" mode: exempts the safe git commands (`add`/`commit`/`checkout -b`/`status`/`diff`/`log`) from the confirmation ASK and auto-approves project installs. Destructive git (force-push, `reset --hard`) and system installs still gate. |

## Library usage

```ts
import { detectHarness } from "@fusengine/harness/detect";
import { evaluate } from "@fusengine/harness/policy";
import { gate } from "@fusengine/harness/runtime";

const { id, mode } = detectHarness();            // { id: "cursor", mode: "hook" }

// stateless guards (file-size, git, security, …)
const verdict = evaluate({ tool: "Write", filePath: "src/big.ts", content });
if (verdict.decision !== "allow") console.error(verdict.prompt?.reason);

// full gate (stateless + stateful APEX, fed from the session track)
const prompt = await gate({ sessionId, framework: "react", tool: "Write",
  filePath: "src/Button.tsx", content, now: Date.now(), trackFile });
```

The `Prompt` it returns (`{ kind: "block" | "ask" | "inform", title, reason, actions? }`)
is portable; each adapter maps it to the harness's native shape.

### Extend it

Add your own project rules without forking — they run **after** the privileged
core chain (two-tier), and the chain is **fail-closed** (a guard that throws blocks,
never silently passes):

```ts
import { registerGuard } from "@fusengine/harness/policy";

registerGuard(({ tool, command }) =>
  tool === "Bash" && command?.includes("kubectl delete")
    ? { kind: "ask", title: "Confirm cluster change", reason: command }
    : null);
```

## Subpath exports

| Subpath | What |
|---------|------|
| `./detect` | `detectHarness()` / `detectMode()` — 13 harnesses, `hook` vs `cli`. |
| `./policy` | `evaluate(ctx)`, the 10 guards, `evaluateApex`, framework detection. |
| `./runtime` | `handleHook`, `gate`, `recordActivity`, `activityFor`, per-harness storage + MCP intercept. |
| `./tracking` | Session track: `recordAgent/Doc/RefRead`, `agentsFresh`, trivial-edit counter. |
| `./refs` | Frontmatter parse, `loadRefs(dir)`, SOLID ref scoring/routing. |
| `./prompt` | The portable `Prompt` type + `formatPrompt`. |
| `./cache` | MCP/WebFetch cache: key, lookup/store, compaction, response extraction. |
| `./memory` | Per-project "never reproduce" lessons. |
| `./config` `./util` `./state` `./statusline` `./freshness` `./init` `./cli` | env config, project-root, locks, statusline, doc-freshness, wiring templates, staged checks. |
| `./adapters/{claude,codex,cursor,cline,gemini}` | Thin per-harness adapters. |

## Documentation

| Guide | What |
|-------|------|
| [docs/index.md](https://github.com/fusengine/harness/blob/main/docs/index.md) | architecture overview + map |
| [docs/detect.md](https://github.com/fusengine/harness/blob/main/docs/detect.md) | harness detection (`hook` vs `cli`) |
| [docs/policy.md](https://github.com/fusengine/harness/blob/main/docs/policy.md) | `evaluate`, file-size, framework, APEX gates |
| [docs/guards.md](https://github.com/fusengine/harness/blob/main/docs/guards.md) | the guard chain, `registerGuard`, fail-closed |
| [docs/runtime.md](https://github.com/fusengine/harness/blob/main/docs/runtime.md) | `handleHook`, `gate`, tracking, MCP intercept |
| [docs/config.md](https://github.com/fusengine/harness/blob/main/docs/config.md) | env config (TTL, max-lines, refs dir) |
| [docs/modules.md](https://github.com/fusengine/harness/blob/main/docs/modules.md) | cache · refs · state · memory · statusline · util |
| [docs/adapters.md](https://github.com/fusengine/harness/blob/main/docs/adapters.md) | adapters + `harness init`/`hook` wiring |
| [CHANGELOG.md](https://github.com/fusengine/harness/blob/main/CHANGELOG.md) | release history |

Run `bun run docs:api` for the generated typedoc API reference.

## Develop

```sh
bun test            # 117 tests
bunx tsc --noEmit   # typecheck (isolatedDeclarations)
bun run build       # dist + .d.mts via tsdown (for Node/bundler consumers)
bun run docs:api    # generate the typedoc API reference
```

CI runs test + typecheck on every PR. MIT licensed.
