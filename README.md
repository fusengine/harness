# @fusengine/harness

A **governance layer for AI coding agents**: gates backed by cited evidence
(not vibes), a decision-time lesson memory, verification receipts, and a
one-shot gate metric — ported from a Claude Code plugin into one **Bun-native**
npm package. The policy core is harness-agnostic; how much of it actually
*enforces* depends on the harness's own hook system — see the
[compatibility matrix](#compatibility) below before assuming parity across harnesses.

```
detect → init (writes that harness's hook wiring) → `harness hook` → guards + APEX gates → native deny/ask/context
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
harness init                              # detects the harness, writes its pre+post hook wiring
export FUSE_HARNESS_MARKETPLACES=fusengine-plugins   # (optional) which marketplaces to auto-scan
export FUSE_HARNESS_REFS=.claude/skills              # (optional) explicit refs dir, overrides auto-discovery
```

`init` writes the wiring file for the detected harness (`.claude/settings.json`,
`.codex/hooks.json`, `.cursor/hooks.json`, `.gemini/settings.json`, or
`.clinerules/hooks/PreToolUse`+`PostToolUse`) — for Claude Code, Codex, Cursor,
Gemini CLI and Cline this covers **PreToolUse + PostToolUse only**
(`src/init/templates.ts`); Hermes has no `init` runner because its config lives
outside the project at `~/.hermes/config.yaml` (`src/adapters/hermes/index.ts:3-4`).
The richer lifecycle (SessionStart, SubagentStart/Stop, Stop, PreCompact/PostCompact,
TaskCompleted, TeammateIdle, PostToolUseFailure, InstructionsLoaded — 14 distinct
Claude Code hook events in total, `src/runtime/lifecycle/dispatch.ts` +
`src/runtime/handle.ts:56-80`) is **implemented** in the runtime but only fires
when something wires those extra hook events into `.claude/settings.json` — either
by hand, or via the fusengine-plugins marketplace this repo is itself developed
under (its ~11 sibling plugins each add their own event, `src/runtime/burst-window.ts:5-11`).

**Where state lives** (two separate roots — this changed across 0.1.34→0.1.51,
don't assume either the old or the "everything in one place" story):

- Session track, deny-loop/one-shot sidecars: **out-of-tree**, under
  `~/.fuse-harness/state/<8-char-md5-of-project-path>/` (`src/runtime/paths.ts:5-6,41-43`) —
  deliberately outside the repo so the protected-path guard never has to bless
  writes to its own enforcement state.
- MCP/WebFetch response cache and the curated `MEMORY/LESSON.md`-equivalent lessons
  file: still **in-tree**, under `<project>/.harness/{cache,memory}`
  (`src/config/layout.ts:15-26`) — `.harness/` is gitignored except
  `memory/LESSON.md`, which is meant to be committed (`STATE_GITIGNORE`,
  `src/config/layout.ts:10`).

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
"command": "bunx @fusengine/harness@0.1.56 hook claude"
// WRONG — may silently keep running a stale global install:
"command": "bunx @fusengine/harness hook claude"
```

**Why.** A still-open bun bug ([oven-sh/bun#5791]) makes an unpinned `bunx <pkg>`
prefer an already-installed **global** copy over npm-latest, and publishing a new
version updates neither that global nor the bunx cache (`bun pm cache rm` does
**not** remove the global). A hook wired without an exact pin can therefore keep
executing an old harness indefinitely after you publish a fix. Pinning `@X.Y.Z`
forces the exact version to resolve.

Run `harness doctor` to see which version is actually executing and whether npm
has a newer one:

```sh
harness doctor
# @fusengine/harness doctor
#   running:    0.1.56
#   package:    /Users/you/.bun/install/global/node_modules/@fusengine/harness
#   runtime:    /Users/you/.bun/bin/bun
#   npm latest: 0.1.57
#   ! stale — npm serves 0.1.57. Pin "@fusengine/harness@0.1.57" in hooks.json.
```

If `doctor` reports a stale global, clear it and re-pin:

```sh
bun remove -g @fusengine/harness && bun pm cache rm
```

[oven-sh/bun#5791]: https://github.com/oven-sh/bun/issues/5791

## Compatibility

**There is no "runs the same on any harness."** Each row is a real ceiling, not
a formatting nuance — read it before assuming a gate that works on Claude Code
also works elsewhere.

| Harness | PreToolUse coverage | Lifecycle (Session/Subagent/Stop/Compact/…) | Known limit |
|---|---|---|---|
| **claude-code** | Full: `evaluate` + APEX gates via `handleHook` (`src/adapters/claude/index.ts`) | 14 event types implemented (`dispatch.ts`) — fires once wired into `.claude/settings.json` beyond the `init` default | None found; richer lifecycle needs manual/marketplace wiring (see Quickstart) |
| **codex** | Bash gated reliably; **`apply_patch` edits are now gated too** — the patch text is parsed per file (`adapters/codex/apply-patch.ts`), each hunk runs the file gates and ONE violating hunk denies the whole patch (`runtime/apply-patch-gate.ts`, sim scenario 22 incl. the multi-file smuggling case). `ask` prompts are **downgraded to explicit deny** (`respond.ts`, sim scenario 23) because Codex fails open on unsupported shapes. | Not wired by `harness init codex` (PreToolUse `Bash\|apply_patch` + PostToolUse only, `src/init/templates.ts:29-38`) | Upstream caveat: Codex itself does not always enforce a correct `apply_patch` deny (openai/codex#27833) — we emit the right verdict; enforcement is theirs. No interactive `ask`. |
| **cursor** | `beforeShellExecution` can deny/ask (shell only, `cursor/index.ts:16-21`) | none | File edits are **advisory only**: `afterFileEdit` always returns `allow` + a `user_message` correction on violation — a `deny` there has no proven effect (hook was "informational only" at launch, and Cursor's deny-enforcement for file ops is confirmed broken upstream, forum.cursor.com/t/154377). Human sees the message; the model is never re-informed. Platform ceiling, documented in `cursor/index.ts`. |
| **gemini-cli** | `BeforeTool` denies via `{decision:"deny",reason}` (`gemini/index.ts:22-36`) | none | Thin stateless adapter — no session track, no APEX gates wired through it. |
| **cline** | `PreToolUse` only; block → `{cancel:true}`, non-block → `contextModification` (`cline/index.ts:24-36`) | none | Same as gemini-cli: stateless guard only. |
| **hermes** | `pre_tool_call` proven: reuses the Claude stdin reader, blocks via `{decision:"block",reason}` (`hermes/index.ts:12-36`) | untested — no lifecycle dispatch wired for Hermes in this repo | `ask`/`inform` degrade to non-blocking `{context}` — Hermes "has no interactive ask state" (`hermes/index.ts:27-28`). |

## What it enforces

Guard/gate chain evaluated before a tool runs (`src/policy/guards/index.ts`,
`src/policy/apex-gates.ts`, `src/policy/evaluate.ts`):

| Guard / gate | Fires on |
|---|---|
| security | `rm -rf /`, fork bombs, `curl \| sh`; `sudo` (asks) |
| protected-path | edits to `.claude/plugins\|logs\|cache`, `.git/`, the harness's own state dirs |
| bash-write | `python3 -c` / `sed -i` / redirects to code files |
| interface-separation | top-level interface/type/protocol in a component/controller |
| install | `npm/pip/brew/...` installs (asks) |
| git | destructive git (`push --force`, `reset --hard`, …) — block; routine git — ask |
| file-size (SOLID) | a code file over `FUSE_SOLID_MAX_LINES` (default 100) |
| APEX brainstorm | creating a new file without brainstorming (when flagged) |
| APEX freshness | `explore-codebase` + `research-expert` not run within the window |
| APEX doc-consulted | Context7 **and** Exa not consulted this session (a web-only fallback also passes) |
| APEX solid-read | required SOLID refs (auto-discovered, or `FUSE_HARNESS_REFS`) not read within the TTL |
| framework sub-skill | framework / shadcn / Tailwind code whose required skill wasn't read this session |
| Gemini MCP (opt-in) | hand-written Tailwind UI without a `mcp__gemini-design__*` call — only when `FUSE_ENFORCE_GEMINI_MCP` is set |
| MCP verbosity / cache | caps exa `numResults`; serves a fresh cached MCP/WebFetch result |

A trivial-edit fast path lets a few tiny (< 5-line, non-`replace_all`) `Edit`s
through per window without the full APEX gates (`Write` is never trivial).

## Beyond gating: memory, receipts, one-shot metric

Features shipped since 0.1.44, each with its own test:

- **Deny-loop breaker** — an identical retried call that was already denied gets
  a rewritten `[REPEAT] … STOP` message forcing a different approach, instead of
  looping silently (`src/policy/deny-loop.ts`, `test/deny-loop.test.ts`).
- **Burst-window dedup** — every deployed plugin registers its own hook, so one
  real tool call can fan out to ~11 sibling processes; a same-op record within
  2s is folded into the first instead of re-counted (`src/runtime/burst-window.ts`,
  `test/burst-dedup.test.ts`).
- **One-shot gate metric** — every gate outcome (deny or its later fix) lands in
  a 7-day sidecar keyed by a content-free op hash, so a deny→allow transition is
  visible (`src/tracking/one-shot.ts`, `test/one-shot.test.ts`).
- **Verification receipts** — a `tsc`/test run is captured from PostToolUse Bash
  output; `TaskCompleted` **refuses** a "done" over modified code files without a
  fresh passing receipt (`src/tracking/receipts.ts`, `test/receipts.test.ts`).
- **Decision-time lessons** — a `MEMORY/LESSON.md` bullet tagged with
  `[TRIGGERS tool:… path:… error:… keyword:…]` is injected as `additionalContext`
  the moment a matching call is about to repeat a known mistake, cooldown-guarded
  (`src/policy/lessons/lesson-gate.ts`).
- **Failure lessons** *(Claude-Code-only — no `PostToolUseFailure` hook on Codex/Hermes,
  `src/runtime/lifecycle/failure-lesson.ts:8-9`)* — a tool failure's error message is
  matched against `error:`-triggered lessons and injected on the spot
  (`test/failure-lesson.test.ts`, `test/sim/scenarios/17-failure-lesson.json`).
- **TeammateIdle anti-false-done** *(Claude-Code-only, `teammate-idle-check.ts:9-10`)* —
  files a teammate announced as changed are checked against disk; a missing file
  warns the lead before it's treated as done (`test/teammate-idle-check.test.ts`).
- **PostCompact re-injection** — after context compaction, the reconciliation
  snapshot is re-sent with a "reread files before editing" reminder, deduped per
  session (`src/runtime/lifecycle/post-compact.ts`, `test/post-compact.test.ts`).
- **Reconciliation snapshot at SessionStart** — git state, running harness
  version + drift vs. npm, `.claude/BOARD.md`, and the one-shot summary, each
  collector isolated so one failure can't blank the rest
  (`src/runtime/lifecycle/snapshot/index.ts`, `test/snapshot.test.ts`).
- **Injection budget cap** — harness-produced context fragments (lessons,
  snapshot, APEX task context) are capped at ~8000 chars each; owner-authored
  content (CLAUDE.md/rules) is never capped
  (`src/runtime/inject-budget.ts`, `test/inject-budget.test.ts`).
- **Hook simulator** — 18 end-to-end scenarios (payload in, expected verdict out)
  replayed against the real CLI in both `src` and built `dist` modes in CI
  (`test/sim/README.md`, `test/sim/scenarios/`).

### Environment

| Var | Effect |
|---|---|
| `FUSE_SOLID_MAX_LINES` | SOLID file-size limit (default `100`). |
| `FUSE_HARNESS_REFS` | Explicit `path.delimiter`-list of `.md` SOLID-reference dirs → activates `solidReadGate`. Overrides auto-discovery. |
| `FUSE_HARNESS_MARKETPLACES` | Comma-list of marketplace names whose `solid-*` skill refs are auto-discovered when `FUSE_HARNESS_REFS` is unset (default `fusengine-plugins`). |
| `FUSE_ENFORCE_TTL_SEC` | APEX freshness window in seconds (default `120`). |
| `FUSE_LESSONS_THROTTLE_MIN` | Lessons-injection throttle, minutes (default `5`). |
| `FUSE_ENFORCE_GEMINI_MCP` | **Opt-in (default off).** Blocks hand-written Tailwind UI (`.tsx/.jsx/.vue/.svelte`) until a `mcp__gemini-design__*` call is made this session. Read fresh per call (`src/policy/gemini-mcp-gate.ts`). |
| `FUSE_DESIGN_GEMINI` | **Opt-in (default off), a *different* gate from the one above.** Enables the design-pipeline's own Gemini gates (`create_frontend` validation + "generate before hand-writing HTML/CSS") — inert unless a design agent is active (`src/policy/design/gates.ts:58-60`, see [docs/design.md](docs/design.md)). |
| `FUSE_MCP_TTL_SEC` | MCP (Context7/Exa) cache freshness, seconds (default 48h, `src/runtime/mcp-key.ts`). |
| `FUSE_WEBFETCH_TTL_SEC` | WebFetch cache freshness, seconds (default 24h — pages stale faster than docs). |
| `RALPH_MODE` | **Opt-in (default off).** Exempts safe git commands (`add`/`commit`/`checkout -b`/`status`/`diff`/`log`) from the confirmation ask and auto-approves project installs. Destructive git (force-push, `reset --hard`) and system installs still gate. |
| `CLAUDE_PROJECT_DIR` | Overrides the project root used to hash the out-of-tree state dir (`src/runtime/paths.ts:20`). |

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
is portable; each adapter maps it to the harness's native shape — but, per the
compatibility matrix above, not every harness can act on every `kind`.

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
| `./policy` | `evaluate(ctx)`, the guard chain, `evaluateApex`, framework detection. |
| `./runtime` | `handleHook`, `gate`, `recordActivity`, `activityFor`, per-harness storage + MCP intercept. |
| `./tracking` | Session track: `recordAgent/Doc/RefRead`, `agentsFresh`, receipts, one-shot metric. |
| `./refs` | Frontmatter parse, `loadRefs(dir)`, SOLID ref scoring/routing. |
| `./prompt` | The portable `Prompt` type + `formatPrompt`. |
| `./cache` | MCP/WebFetch cache: key, lookup/store, compaction, response extraction. |
| `./memory` | Per-project "never reproduce" lessons. |
| `./config` `./util` `./state` `./statusline` `./freshness` `./init` `./cli` | env config, project-root, locks, statusline, doc-freshness, wiring templates, staged checks. |
| `./adapters/{claude,codex,cursor,cline,gemini,hermes}` | Thin per-harness adapters — see [Compatibility](#compatibility) for what each can actually enforce. |

## Documentation

| Guide | What |
|-------|------|
| [docs/index.md](https://github.com/fusengine/harness/blob/main/docs/index.md) | architecture overview + map |
| [docs/detect.md](https://github.com/fusengine/harness/blob/main/docs/detect.md) | harness detection (`hook` vs `cli`) |
| [docs/policy.md](https://github.com/fusengine/harness/blob/main/docs/policy.md) | `evaluate`, the guard chain, framework, APEX gates |
| [docs/guards.md](https://github.com/fusengine/harness/blob/main/docs/guards.md) | the guard chain, `registerGuard`, fail-closed |
| [docs/runtime.md](https://github.com/fusengine/harness/blob/main/docs/runtime.md) | `handleHook`, `gate`, tracking, MCP intercept, state paths |
| [docs/config.md](https://github.com/fusengine/harness/blob/main/docs/config.md) | env config (TTL, max-lines, refs dir, Gemini opt-ins) |
| [docs/modules.md](https://github.com/fusengine/harness/blob/main/docs/modules.md) | cache · refs · state · memory · statusline · util |
| [docs/adapters.md](https://github.com/fusengine/harness/blob/main/docs/adapters.md) | adapters, compatibility, `harness init`/`hook` wiring |
| [docs/design.md](https://github.com/fusengine/harness/blob/main/docs/design.md) | design-agent pipeline — state machine, gates, opt-in Gemini |
| [CHANGELOG.md](https://github.com/fusengine/harness/blob/main/CHANGELOG.md) | release history |

Run `bun run docs:api` for the generated typedoc API reference.

## Known limitations

- **Codex file edits are not gated.** The SOLID/file-size gate keys off
  `tool_input.file_path`, which Codex's `apply_patch` call never supplies — only
  Bash is reliably gated on Codex today (see [Compatibility](#compatibility)).
- **Cursor file edits are advisory-only.** `afterFileEdit` fires after the edit
  already happened — a platform limit, not something this harness can work around.
- **Hook fan-out is mitigated, not eliminated.** The ~11-sibling-plugin burst is
  deduped within a 2s window (`BURST_DEDUP_MS`), but that window is a heuristic,
  not a protocol guarantee — an unusually slow fan-out could in theory land
  outside it.
- **Sidechain hook reliability is a platform issue, worked around, not fixed.**
  Sub-agent `PostToolUse` hooks don't always fire on Claude Code (documented
  platform issues #43612/#27655/#34692); `SubagentStop` transcript harvesting
  (`src/freshness/evidence-harvest-io.ts`) compensates, but only at that
  checkpoint, not continuously.
- **Hermes coverage beyond `pre_tool_call` is unverified** — no lifecycle events
  have been proven against a live Hermes install in this repo.

## Develop

```sh
bun test            # 484 tests (94 files)
bunx tsc --noEmit   # typecheck (isolatedDeclarations)
bun run build       # dist + .d.mts via tsdown (for Node/bundler consumers)
bun run docs:api    # generate the typedoc API reference
```

CI runs test + typecheck on every PR. MIT licensed.
