# Changelog

All notable changes to `@fusengine/harness`. Format: [Keep a Changelog](https://keepachangelog.com), [SemVer](https://semver.org).

## [0.1.33] - 2026-06-27

### Fixed

- **Dual-runtime**: the published CLI now runs under Node (npx/npm/global) as well as Bun.
  Replaced all Bun-only APIs (Bun.file/write/spawn/sleep/stdin) and the bun Glob import with
  node:fs / node:child_process / process.stdin via a new src/util/runtime-io compat module —
  fixes the "Cannot find package bun" crash on Node installs (the bin ships a node shebang).

### Changed

- init: generated hook command "npx harness" -> "npx -y @fusengine/harness"; the Claude
  PreToolUse matcher is widened to Write|Edit|Bash so git/install/bash are guarded.

## [0.1.32] - 2026-06-25

### Added (fuse-lessons + fuse-seo ports → harness, ecosystem map → `carto`)
- **New `lessons` scope** (`PluginScope`, `cli/bin.ts` `validScopes`): ports fuse-lessons' 4 events to
  `runtime/lifecycle/lessons/`. `dispatchLessons` routes SessionStart/SubagentStart (inject
  `<root>/MEMORY/LESSON.md` as additionalContext), Stop (cross-project reminder for roots with unsaved
  code edits, throttled via the existing `memory/registry` + `memory/state`), and PostToolUse (arm the
  per-project throttle, wired through `postTrackingSideEffects`). `lessons/state.ts` overrides only the
  two `<root>/MEMORY/` paths, reusing all state/throttle logic from `src/memory`.
- **New `seo` scope**: ports fuse-seo's validate hook. `policy/seo/validate.ts` (`isHtmlLike`,
  `missingSeoElements`) is a zero-dependency regex presence-gate (no cheerio); `lifecycle/seo/post-tool-use.ts`
  denies an HTML-like edit under a `.fuse-seo` marker that is missing any of the 7 SEO elements, via a
  `permissionDecision: deny` PostToolUse response (`seoPostToolUseResponse`).
- **Cartographer ecosystem map** folded into the `carto` scope: `cartoSessionStart` now regenerates BOTH
  the project map AND the plugin ecosystem map (`cartographer/ecosystem-map.ts` ports `generate_map.py`,
  reusing `findMarketplacePlugins`/`readPluginMeta`/`scanPlugin`/`mergeLines`/`writePluginMap`) and emits
  the navigation context as additionalContext.

## [0.1.31] - 2026-06-25

### Added (ai-pilot cache/injection port → harness, new `aipilot` scope)
- **New plugin scope** `aipilot` on `PluginScope`, resolved from the `hook <id> aipilot` CLI arg
  (`cli/bin.ts` `validScopes`). Unlike the other scopes (routed by event), the ai-pilot scope also
  routes by **agent matcher** (the payload's `agent_type`), reproducing the ai-pilot plugin's
  per-agent `hooks.json` entries now that the 11 TypeScript scripts live in the harness.
- **`runtime/lifecycle/aipilot/*`** — the ported cache + injection handlers (each < 100 lines):
  - `dispatch-aipilot.ts` — the (event, agent_type) router (`dispatchAipilot` + `aipilotPostToolUse`).
  - `cache-base.ts` — shared project-hash/age/checksum helpers, reusing `home-state.fusengineCache`
    so ai-pilot caches share the existing `~/.claude/fusengine-cache` tree (no second cache layer).
  - **SubagentStart injectors**: `inject-apex.ts` (matcher "": APEX AGENTS.md + task context +
    cartographer paths, ports `inject-subagent-context.ts`), `inject-explore.ts` (explore-codebase:
    cached architecture or save block, ports `explore-cache-check.ts`), `inject-doc.ts`
    (research-expert: cached docs, ports `doc-cache-inject.ts`), `inject-lessons.ts` (matcher "":
    known-issues, ports `lessons-cache-inject.ts`), `inject-test.ts` (sniper: changed-file list,
    ports `test-cache-inject.ts`).
  - **SubagentStop writers**: `cache-doc.ts` (research-expert synthesis → doc cache, ports
    `cache-doc-from-transcript.ts`), `cache-lessons.ts` (sniper edits → lessons, ports
    `cache-sniper-lessons.ts` — the dead `promote-global-lessons.ts` spawn is dropped),
    `cache-test.ts` (sniper linter output → per-file checksums, ports `cache-test-results.ts`).
  - **SessionEnd**: `analytics.ts` (`logCacheEvent` + `cacheAnalyticsSave`, ports
    `cache-analytics-save.ts`).
  - **PostToolUse (TaskCreate|TaskUpdate)**: `sync-task.ts` + `apex-task-store.ts` (lock + task.json
    create/start/complete + commit reminder, ports `sync-task-tracking.ts`).
  - Support modules: `transcript.ts` (JSONL parse), `source-scan.ts` (monorepo glob + stack detect),
    `lessons.ts` (dedup/merge/categorize), `types.ts` (cache + APEX interfaces).

### Changed (deduplication — fused, not duplicated)
- **`policy/claude-md-context.ts` `buildApexInstruction`** absorbs the richer ai-pilot
  UserPromptSubmit APEX preamble (tracking-file note, 3-agents-in-parallel mandate,
  `${projectType}-expert`, split target, doc-status reminder). The **single** core-scope
  UserPromptSubmit injection now carries it — ai-pilot's `detect-and-inject-apex.ts` is **not**
  re-emitted (its `hooks.json` UserPromptSubmit entry is removed), avoiding a double APEX injection.
- **`runtime/lifecycle/dispatch.ts`** guards the core `SubagentStart`/`SubagentStop`/`SessionEnd`
  cases so the core handlers (`subagentCacheContext` MCP-cache table, `trackAgentMemory`,
  `cleanupSession`) do **not** fire for the `aipilot` scope — the ai-pilot SubagentStart cache
  injectors are emitted via separate `hooks.json` entries, so there is no double emission, and the
  MCP cache continues to be served by the core scope.
- **`runtime/handle.ts`** runs the async `dispatchAipilot` before the sync lifecycle dispatch and
  routes `aipilot` PostToolUse TaskCreate/TaskUpdate to `aipilotPostToolUse`.

## [0.1.30] - 2026-06-25

### Added (lifecycle/session/context port: cartographer + security-expert + changelog-watcher hooks → harness)
- **New plugin scopes** `carto` | `security` | `changelog` on `PluginScope`, resolved from the
  `hook <id> <scope>` CLI arg (`cli/bin.ts`), routing three more plugins' Python hooks into the harness:
  - **cartographer** — pure policy `policy/cartographer/*` (`indicators.ts` project-detection +
    exclude sets, `frontmatter.ts` YAML field/body parse, `entry.ts` index-line regex parse,
    `describe.ts` heading/comment/desc extraction) and runtime effects
    `runtime/lifecycle/cartographer/*` (`fs-util.ts` tree walk + file desc, `merge.ts` enriched-
    sidecar-aware index merge, `write-tree.ts` recursive `index.md` generation, `project-map.ts`
    project-tree map, `track-enrichment.ts` `.enriched.json` sidecar, `session-start.ts`).
    **SessionStart (carto)** generates the project map (ports `generate_project_map.py`);
    **PostToolUse (carto, Edit/Write)** tracks enriched descriptions (ports `track-enrichment.py`).
    *(The plugin ecosystem map `generate_map.py` and its libs are NOT ported and stay in Python.)*
  - **security-expert** — `runtime/lifecycle/security/*` (`skill-state.ts` shared
    `~/.claude/logs/00-security` state + UTC date/iso helpers, `check-skill.ts` **non-blocking**
    advisory `permissionDecision: allow` + `additionalContext` when the security skill is unread,
    `track-skill-read.ts`, `track-mcp.ts`). **PreToolUse (security)** is advisory-only — it never
    runs the core APEX/SOLID/file-size gate chain. Ports `check-security-skill.py`,
    `track-skill-read.py`, `track-mcp-research.py`.
  - **changelog-watcher** — `runtime/lifecycle/changelog-research.ts`: **PostToolUse (changelog)**
    logs Exa/WebFetch/WebSearch research to `~/.claude/logs/00-changelog`. Ports
    `track-watch-research.py`.
- **Post-tracking side-effects** `runtime/lifecycle/post-tracking.ts` (`postTrackingSideEffects`):
  routes PostToolUse to the carto/security/changelog trackers by scope (side-effects only, no stdout),
  wired into `handle.ts`; security PreToolUse advisory wired into `handle-pre.ts`.

### Added (lifecycle/session/context port: core-guards + solid + claude-rules hooks → harness)
- **Lifecycle hook dispatch** (`runtime/lifecycle/*` + `runtime/lifecycle-bridge.ts`): ports
  the remaining Python hooks of the core-guards, solid, and claude-rules plugins into the
  harness, routed by event in `handleHook` via a new `scope` (`core` | `solid` | `rules`)
  resolved from the `hook <id> <scope>` CLI arg:
  - **SessionStart (core)** `lifecycle/session-start.ts`: inject `~/.claude/CLAUDE.md` + dev
    context (git branch/status + project type) and run the cache/state cleanups — ports
    `inject-claude-md.py`, `load-dev-context.py`, `cleanup-session-states.py`,
    `cleanup-old-caches.py` into one call.
  - **SessionStart (solid)** `lifecycle/solid-detect.ts`: detect the SOLID profile and append
    `SOLID_*` exports to `CLAUDE_ENV_FILE` — ports `solid/detect-project.py`.
  - **SessionStart + UserPromptSubmit (rules)** `lifecycle/inject-rules.ts`: concatenate
    `${CLAUDE_PLUGIN_ROOT}/rules/*.md` as `additionalContext` — ports `claude-rules/inject-rules.py`.
  - **PostToolUse (core, Write/Edit)** `lifecycle/track-changes.ts` + `lifecycle/post-edit-ts.ts`:
    cumulative session-change tracking → sniper reminder, and eslint/prettier report — ports
    `track-session-changes.py` + `post-edit-typescript.py`.
  - **SubagentStart** `lifecycle/subagent-cache.ts` (MCP cache table, ports `inject-context-cache.py`),
    **SubagentStop** `lifecycle/agent-memory.ts` (ports `track-agent-memory.py`),
    **TeammateIdle** `lifecycle/teammate-idle.ts`, **PostToolUseFailure** `lifecycle/tool-failure.ts`,
    **PreCompact** `lifecycle/pre-compact.ts`, **SessionEnd** `lifecycle/session-end.ts`,
    **InstructionsLoaded** `lifecycle/instructions-loaded.ts`.
- **Shared state/cleanup helpers**: `runtime/home-state.ts` (the `_shared/state_manager` +
  `cache_io` equivalent: `~/.claude/fusengine-cache` paths, session-state load/save, session-id
  sanitize), `runtime/fs-cleanup.ts` (mtime/TTL file removal, log trim, whitelisted-subtree purge,
  empty-dir prune), `runtime/dev-context.ts` (git + project-type context). `handleHook`'s
  PreToolUse pipeline extracted to `runtime/handle-pre.ts` to keep each module < 100 lines.

### Added (finishes the plugin→harness port: the last two context-injection hooks)
- **CLAUDE.md + APEX UserPromptSubmit injection** (`policy/claude-md-context.ts`):
  reads `~/.claude/CLAUDE.md` and, when the prompt matches the FR/EN dev-verb regex,
  prepends the APEX instruction (project type detected from the cwd; max-lines from
  the single-source `resolveMaxLines()`). Emitted as `additionalContext` from
  `handleHook` on UserPromptSubmit (alongside the existing brainstorm flag). Ports
  the plugin's `core-guards/scripts/user-prompt/read-claude-md.py`.
- **APEX Task PreToolUse injection** (`policy/apex-task-context.ts`): when the
  project's `.claude/apex/` exists, reads `task.json` and injects the APEX sub-agent
  context (`additionalContext`) for `tool === "Task"`. Ports the plugin's
  `ai-pilot/scripts/inject-apex-context.py`.
- **`runtime/inject-context.ts`**: thin renderers wiring both behaviors into the
  Claude `additionalContext` response shape; consumed by `handleHook`.

## [0.1.29] - 2026-06-25

### Added (completes the plugin→harness port; nothing left in the plugins' `_shared`)
- **DRY duplication gate** (`runtime/dry.ts`): extracts declared symbols from a
  Write/Edit, greps the codebase (module-boundary aware, fail-open on grep
  error/timeout), and blocks when 2+ existing declarations clash. Wired into
  `gate()` after the APEX gates.
- **`detectModularArchitecture`** (`policy/detect-project.ts`): FuseCore (Laravel)
  and `modules/`-based Next.js sub-architecture detection.
- **pre-commit gate** (`runtime/precommit.ts`): runs eslint/tsc/prettier/ruff on a
  `git commit` and blocks on errors (effectful, fail-open, never auto-fixes).
- **design pipeline** (`policy/design/*` + `runtime/design.ts`): the full design-agent
  state machine ported from the plugin — phase ordering, HTML/CSS-only writes, screenshot
  quota + scroll-before-screenshot, inspiration/identity gating, Gemini create_frontend
  validation (OKLCH/forbidden-fonts/reference-URL), and post-write content checks
  (accessibility/AI-slop/hardcoded-colors) as non-blocking warnings. Activated by the
  design-agent flag; inert for every other agent. Gemini gates are opt-in via
  `FUSE_DESIGN_GEMINI` (off by default).
- **modular architecture gate** (`runtime/modular.ts`): enforces Next.js `modules/`
  (app/ conventions + cross-module imports) and Laravel FuseCore (app/ domain ban,
  `module.json`, cross-module use) — only when the architecture is detected on disk.
- **framework SOLID rules** (`policy/framework-solid*`): per-framework rules beyond the
  generic file-size/interface guards — React (custom hooks under `hooks/`), Next.js
  (`'use client'` directive, adaptive 150-line limit for route files), Laravel
  (interfaces under `Contracts/`, fat-controller 80-line), Swift (`@MainActor`/`Sendable`,
  protocols under `Protocols/`, adaptive 150 for View/Screen). Counts the full on-disk
  file on Edit; skips vendor/build dirs.
- **skill triggers** (`policy/skill-triggers.ts` + `skill-patterns/*`): detects a library
  API in written code (e.g. `useActionState`→react-19, Prisma→prisma-7, shadcn markup→
  shadcn skill) and blocks until the matching sub-skill ref was read in-session;
  `*-shadcn` required only in shadcn projects. `requiredArchSkill` forces the
  modular-architecture skill (`solid-nextjs`/`fusecore`).

### Fixed
- **file-size**: `countLines` counts CODE-ONLY lines (skips blank + `//`/`*`/`/*`
  comment lines), matching the original; `#` stays code (Rust/C).

## [0.1.28] - 2026-06-24

### Fixed (security)
- **macOS raw-disk bypass**: the `dd` block missed `/dev/rdisk` (the raw, faster,
  more destructive macOS path), so `dd of=/dev/rdisk2` slipped through — widened to
  `r?disk` (+ `xvd`).
- **ReDoS in `stripHeredoc`**: the lazy dot-all + backreference could backtrack
  catastrophically (O(n³)); rewrote as a linear two-phase scan (backreference-free
  opener + per-heredoc closer search), preserving `<<-` indented-closer semantics.

## [0.1.27] - 2026-06-24

### Fixed (port parity — gaps found by a Python↔TS content diff)
- **security**: the `dd` block matched only `if=/dev/zero of=/dev/`; widened to any
  `dd … of=/dev/<disk>`. Added `del` to the ask list, and a `stripHeredoc()` pass so
  a heredoc body no longer triggers false positives.
- **refs routing**: keyword scoring is now case-insensitive (lowercased haystack),
  matching the original.
- **refs loading**: `level` is now inferred from the path when the frontmatter omits
  it (`templates/`→template, SOLID slug→principle, else architecture) — restores the
  principle/template hoisting for refs without an explicit `level:`.

## [0.1.26] - 2026-06-24

### Changed
- `loadRefs` now accepts a **path-delimiter list of directories** (`dir1:dir2`,
  cross-platform via `path.delimiter`) and scans each, so `FUSE_HARNESS_REFS` can
  point straight at the spread `solid-*/references` dirs — no copy/aggregation step,
  no content duplication, and only the SOLID ref dirs are scanned (fast).

## [0.1.25] - 2026-06-24

### Changed (framework-aware SOLID routing)
- `scoreReferences` now weights each `applies-to` glob match by **specificity**
  (`+10` base + `+5` per literal path segment), so the most specific skill wins:
  `**/app/**/*.tsx` (nextjs) > `**/*.tsx` (react) > `**/*.ts` (generic). The
  solid-read gate routes to the right language/framework skill purely from the
  skills' declared globs — no hardcoded framework list. Add a `solid-vue` skill
  with `applies-to: **/*.vue` and it routes automatically.

### Planned
- OIDC Trusted Publishing once the npmjs trusted-publisher entry matches the
  workflow (currently the registry returns "package not found" at token exchange).

## [0.1.24] - 2026-06-24

### Changed
- No functional change. Publish continues via `NPM_TOKEN` + provenance. (An OIDC
  trusted-publishing switch was attempted but deferred — the npmjs trusted-publisher
  entry doesn't yet match this workflow.)

## [0.1.23] - 2026-06-24

### Changed
- Repo is now **public** → the publish workflow emits a signed **provenance**
  attestation (`npm publish --provenance`, sigstore). First release with provenance.

## [0.1.22] - 2026-06-24

### Documentation / packaging
- `package.json`: added `repository` / `homepage` / `bugs` — so npmjs links back to
  the repo and resolves the README's relative links.
- README: replaced the single vague `docs/` link with a **Documentation** table
  (absolute GitHub links to each guide + CHANGELOG, so they work on npmjs too).

## [0.1.21] - 2026-06-24

### Documentation
- README: added an **"Extend it"** section with a `registerGuard` example +
  the two-tier / fail-closed note, so the shipped npm landing page documents the
  0.1.20 extensibility API.

## [0.1.20] - 2026-06-24

### Added (ideas mined from OpenClaw + hermes-agent)
- **Fail-closed enforcement**: `runGuards` and the runtime `gate` (`evaluate` +
  `evaluateApex`) now wrap execution — a guard/gate that **throws** returns a block
  (`FAIL_CLOSED`) instead of crashing the hook and letting the tool run ungated.
  Closes a fail-**open** hole (a bug degrades to "too strict", never "no protection").
- **Extensible guard chain** (two-tier, OpenClaw-style): `registerGuard(fn)` adds a
  user guard that runs **after** the privileged core chain (the core can't be
  bypassed); `clearUserGuards()` resets. Turns the fixed 5-guard chain into an
  extensible policy engine — users add project rules without forking.

### Note
- Adopted only the in-scope, non-babysitting ideas from the OpenClaw/hermes audit;
  secret-redaction, gateway, agent-loop, and memory features were deliberately skipped.

## [0.1.19] - 2026-06-24

### Fixed (parity audit — last inert gap closed)
- **cache-served docs now count as consulted**: when `mcpPreIntercept` serves a
  fresh context7/exa result from cache, `handleHook` records the doc consultation
  (`recordActivity` `doc`), so `docConsultedGate` is satisfied on cross-session
  cache hits — previously only a live MCP call recorded it (the cached branch was
  inert). Cleaner than the plugin's `read_paths`: recorded at serve-time, no
  provider-prefixed cache filenames needed. `mcpPreIntercept` now returns
  `{ stdout, docSource? }` (was a bare string).

### Parity
- This closes the last portable enforcement gap from the 8-agent audit. Remaining
  differences are by design (project-local `.harness/` state, fail-closed
  bash-write whitelist, no Ralph mode, pre-commit-lint out of scope).

## [0.1.18] - 2026-06-24

### Added (parity audit — file-size on-disk + agent exemption)
- **file-size now checks the existing on-disk file**, not just the incoming
  payload: an **Edit** on an already-oversized file blocks (judges `existingLines`
  read by the runtime gate), while a **Write** judges its full new content (so it
  can legitimately shrink a large file). `Explore`/`Plan` agents are exempt.
- `PolicyContext` gains `agentType` + `existingLines`; `GateInput` gains
  `agentType`; `normalizeEvent` extracts `agent_type` / `subagent_type`.

### Documentation
- Refreshed `docs/guards.md` to the current coverage (security commands, Go/Java
  interfaces, git ask set, file-size on-disk, verbosity caps).

## [0.1.17] - 2026-06-24

### Added (parity audit — pattern coverage)
- **git**: `GIT_ASK` += `git commit` / `git add` / `git branch -d` (ask). NOTE:
  with Ralph mode gone, these now prompt on every use — drop the 3 patterns if too noisy.
- **security**: critical += `shred` / `fdisk` / `diskutil erase` / redirect to
  `/dev/{sda,hda,nvme}` / `rm -rf /{etc,usr,var,bin,sbin,…}`; ask += `su` / `doas` /
  `passwd` / `rm` / `unlink`.
- **interface-separation**: now covers **Go** (`type Foo interface`) and
  **Java/Kotlin** (`interface`/`record`), plus widened paths (Python `controllers/`/
  `routes/`, PHP `Handlers/`, Swift `Components/`).
- **verbosity**: caps exa `tokensNum` ≤ 2000 and Context7 `tokens` ≤ 2000 (was numResults only).

## [0.1.16] - 2026-06-24

### Fixed (parity audit — inert gates now actually fire)
- **agent-quality**: `activityFor` derives agent `quality` from the POST response
  length (≥500 → `sufficient`); `recordActivity` persists it, so `agentsFresh`
  finally rejects empty/insufficient agent runs (was structurally inert).
- **brainstorm**: `handleHook` now handles a `UserPromptSubmit` payload —
  `detectCreationIntent(prompt)` → `recordBrainstormRequired`, so `brainstormGate`
  can actually fire (the flag was never set before).

### Removed
- **`dispatchHook`** (`cli/hook.ts`) + its test — dead, stateless, APEX-bypassing
  entry point superseded by `handleHook`. Removed to kill the footgun. Documented
  the thin-adapter (stateless) vs `handleHook` (full) distinction in `docs/adapters.md`.

## [0.1.15] - 2026-06-23

### Added
- **git-ask parity**: `evaluate` now wires `GIT_ASK` (push/checkout/reset/merge/
  rebase/stash/clean/rm/mv/restore/revert/cherry-pick) → a `Prompt{kind:"ask"}`
  confirmation (destructive ops stay a hard `deny`). Previously `GIT_ASK` was
  defined but never consumed.

### Changed
- **TTL honored**: `harness hook` now reads `FUSE_ENFORCE_TTL_SEC` (`resolveTtlSec`)
  and feeds it as the gate window; `DEFAULT_WINDOW_MS` is now **2 min** (was a
  fixed 4 min), matching the plugin + installer default.
- **De-duplicated install patterns**: `installGuard` consumes `PROJECT_INSTALL` /
  `SYSTEM_INSTALL` from `policy/patterns` (added `dnf` / `pacman`); removed the
  guard's duplicate regexes.

## [0.1.14] - 2026-06-23

### Changed
- **Unified, neutral project state dir.** All per-project state now lives under
  one `<root>/.harness/` (was scattered: `.claude/harness/`, `MEMORY/`), so it no
  longer hides inside one harness's config dir:
  - `.harness/track/` (session tracks), `.harness/cache/` (MCP/WebFetch),
    `.harness/memory/` (`LESSON.md` committable + `state.json` machine-local).
  - `harness init` now also writes a selective `.harness/.gitignore`
    (ignores track/cache/state.json, keeps `LESSON.md`).
- **New `config/layout` — single source of truth.** `projectLayout(root)` derives
  every path; `runtime/storage`, `memory`, and `init` all consume it (nothing
  hardcodes a dir name). `harnessTrackDir(id, root)` → `harnessStateDir(root)`;
  `memory` gains `lessonsFileFor(root)`. The HOME roots registry is unchanged.

## [0.1.13] - 2026-06-23

### Documentation
- Rewrote the **README** as a full quickstart: install, `harness init/hook/check`,
  the 10 guards + APEX gates, env vars, the subpath-exports table, and library
  usage — reflecting the complete engine (was the pre-0.1.0 description).
- Added **typedoc**: `bun run docs:api` generates the API reference to `docs/api/`
  (288 pages, 0 errors). `typedoc.json` + `docs:api` script.
- New module guides `docs/guards.md` + `docs/runtime.md`; refreshed `docs/index.md`.

## [0.1.12] - 2026-06-22

### Added
- **MCP interception** — the last two portable guards, wired into `handleHook`:
  - **verbosity cap** (`policy/verbosity`: `capVerbosity`) — caps exa MCP calls to
    3 results (Context7 has no verbosity knob); emitted as an input mutation.
  - **cache lookup/store** (`cache/store`: `mcpCacheKey` / `cacheLookup` / `cacheStore`)
    — a keyed, mtime-TTL'd file cache. On a pre MCP/WebFetch event a fresh hit is
    served (deny + cached content); the post event stores the response.
  - `runtime/mcp` (`mcpPreIntercept` / `mcpPostStore`) routes MCP tool events for
    Claude/Codex/Gemini (harnesses that support input mutation / cache serving).

### Note
- This completes all 10 portable enforcement guards from `core-guards`. The
  remaining plugin pieces (agent prompts, rules/skill content, injection) are
  Claude-specific content, not portable library logic.

## [0.1.11] - 2026-06-22

### Added
- **agent-quality threshold**: `recordAgent(name, ts, quality?)` + `agentsFresh`
  now ignores `insufficient`-quality agent calls (matches the plugin's
  response-length gate).
- **trivial-edit fast path**: the gate lets up to `TRIVIAL_BUDGET` (4) tiny
  (< 5 lines), non-`replace_all` edits per window through without the APEX gates
  (`recordTrivialEdit` / `trivialCount`, sliding window in the track).
- **brainstorm gate**: `brainstormGate` blocks creating new files when
  `brainstormRequired` and the brainstorming agent isn't fresh; `detectCreationIntent(prompt)`
  + `recordBrainstormRequired` provide the signal (harness wires it on UserPromptSubmit).

## [0.1.10] - 2026-06-22

### Added
- **policy/guards** — five portable enforcement guards composed into `evaluate()`
  via a `runGuards` chain (first firing guard wins, ahead of git + file-size):
  - `bashWriteGuard` — blocks `python3 -c` / `sed -i` / redirects to code files.
  - `installGuard` — asks before `npm/pip/brew/...` installs.
  - `securityGuard` — blocks `rm -rf /`, fork bombs, `curl | sh`; asks on `sudo`.
  - `interfaceSeparationGuard` — blocks top-level interface/type/protocol in
    component/view/controller files (Interface Segregation).
  - `protectedPathGuard` — hard-denies edits to `.claude/plugins|logs|cache`, `.git/`.
  Shared `GuardContext` type; all exported via `./policy`. (Authored in parallel by a guard team.)

## [0.1.9] - 2026-06-22

### Added
- **refs/loader**: `loadRefs(dir)` scans a directory recursively for `.md`
  reference files and parses each frontmatter into a `RefMeta` (tolerant of
  kebab/camel keys via `toRefMeta`). The content is the consumer's — point it at
  ANY refs dir. This activates `solidReadGate` (previously inert without a source).
- **runtime/handle**: `HandleOptions.refsDir` — when set, `handleHook` loads the
  refs and feeds them to the gate. `harness hook` reads it from `FUSE_HARNESS_REFS`.

## [0.1.8] - 2026-06-22

### Changed
- **init** now wires BOTH phases: a PRE hook to gate edits AND a POST hook
  (catch-all → `activityFor` filters) so the track fills automatically. Claude/
  Codex add `PostToolUse`, Gemini adds `AfterTool` (regex `.*`), Cursor keeps
  `afterFileEdit`, and Cline gets a second executable `.clinerules/hooks/PostToolUse`.
- `initFor(id)` now returns `InitFile[]` (was a single file); `harness init`
  writes all of them. `harness init` is now plug-and-play end-to-end.

## [0.1.7] - 2026-06-22

### Added
- **runtime/handle**: `handleHook(id, payload, {now, cwd})` — the full loop.
  On a PRE event it gates the tool-use (stateless guards → APEX gates from the
  track) and returns the native response; on a POST event it records the
  activity. `harness hook <id>` now runs this end-to-end.
- **runtime/normalize**: `normalizeEvent(id, payload)` → uniform `{phase, tool,
  input, sessionId, filePath, content, command}` across Claude/Codex/Gemini/
  Cursor (`tool_name`/`tool_input`) and Cline (nested `preToolUse`).
- **runtime/respond**: `respond(id, prompt)` maps a portable `Prompt` to each
  harness's native block/ask response.

### Changed
- `harness hook` is now async and stateful (was the sync, stateless `dispatchHook`,
  still exported for simple use).

## [0.1.6] - 2026-06-22

### Added
- **runtime/storage**: `harnessTrackDir(id, projectRoot)` — stores each harness's
  track under its OWN config dir (`.claude/harness`, `.codex/harness`,
  `.cursor/harness`, `.gemini/harness`, `.clinerules/harness`; `.fuse-harness`
  fallback), next to its hooks, scoped per project.
- **runtime/activity**: `activityFor(event)` maps a live tool-use to an
  `Activity` to record — MCP doc calls (`context7`/`exa`, any separator) → `doc`,
  `Task` + `subagent_type` → `agent` (bare name), a read of a `.md` → `ref`.
  Tool names verified against each harness's 2026 hook docs. Closes the
  auto-fill loop: adapter PostToolUse → `activityFor` → `recordActivity`.

## [0.1.5] - 2026-06-22

### Added
- **runtime** — the end-to-end glue between tracking and the gates:
  - `gate(input)`: runs the stateless guards (file-size, git) first, then loads
    the session track and runs `evaluateApex` (freshness → docs → SOLID). First
    block wins; APEX applies only to code edits.
  - `recordActivity(file, activity)`: a discriminated-union (`agent` | `doc` |
    `ref`) PostToolUse recorder that persists into the track.
  - `trackFile(sessionId, baseDir?)` path resolver; `REQUIRED_AGENTS` +
    `DEFAULT_WINDOW_MS` (4 min). New subpath export `./runtime`.

## [0.1.4] - 2026-06-22

### Added
- **tracking** — the session-state layer that feeds `evaluateApex`. Immutable
  record helpers (`recordDoc`, `recordRefRead`, `recordAgent`) + `agentsFresh()`
  (all required agents seen within a window), and a `loadTrack`/`saveTrack` store.
  An adapter records activity on PostToolUse and reads it back to build the
  `ApexContext` on PreToolUse.
- **policy/apex**: `freshnessGate` — blocks when the prior agents (explore +
  research) are not fresh (`agentsFresh: false`); added to the default gate chain
  ahead of docs + SOLID. New `ApexContext.agentsFresh` field.

## [0.1.3] - 2026-06-22

### Added
- **policy/apex** — `evaluateApex(ctx)`: composes the APEX gates as a
  chain-of-responsibility (first failing gate's `Prompt` wins). Ships
  `docConsultedGate` (Context7 + Exa via `isDocConsulted`) and `solidReadGate`
  (the routed required SOLID refs must be read, via `routeReferences`). Pure;
  the harness adapter supplies the session state (`authorizations`, `refs`,
  `refsRead`). Gates are individually exported + overridable.

## [0.1.2] - 2026-06-22

### Added
- **adapters/codex**: OpenAI Codex CLI adapter. Codex's `PreToolUse` hook (2026)
  is Claude-compatible (`tool_name`/`tool_input` → `hookSpecificOutput.permissionDecision`),
  so it reuses the Claude guard. Codex is now `hook`-mode in `detect` (was `cli`).
- **init**: `harness init [id]` writes the wiring file for the detected (or named)
  harness — `.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`,
  `.gemini/settings.json`, or an executable `.clinerules/hooks/PreToolUse` — each
  pointing at `npx harness hook <id>`. Formats verified against each harness's docs.
- **hook dispatcher**: `harness hook <id>` reads a hook payload on stdin, routes it
  to the matching adapter, and prints the harness's native response.

### Changed
- The bin is now **`harness`** with subcommands (`check` | `init` | `hook`),
  replacing the single-purpose `harness-check`.

## [0.1.1] - 2026-06-22

### Added
- **adapters/cursor** (`beforeShellExecution` blocks via `permission: deny`;
  `afterFileEdit` observe-only), **adapters/cline** (`PreToolUse` → `cancel`),
  **adapters/gemini** (`BeforeTool` → `decision: deny`). Schemas verified against
  each harness's 2026 hook docs. All map their payload → `evaluate()` → native response.
- **cli** + **`harness-check`** bin: a cli-mode entry for harnesses without hooks
  (Aider, Windsurf, OpenHands). Run it as a pre-commit step — checks staged files
  (`git diff --cached` + `git show :path`) against the policy core, exits non-zero on a violation.
- Subpath exports for the new adapters + `./cli`; `bin.harness-check`.

## [0.1.0] - 2026-06-22

### Added
- **detect**: `detectHarness()` / `detectMode()` — 12 harnesses (Claude Code,
  Codex, Cursor, Cline, Gemini, opencode, Windsurf, Copilot, Aider, Kiro,
  Goose, Amp) via env signals + `AGENT`/`AI_AGENT` standards.
- **policy**: `evaluate(ctx)` unified surface; `evaluateFileSize`,
  `detectProjectType`, `detectFramework`, git/install guard patterns.
- **config**: env-driven `resolveTtlSec` / `resolveMaxLines` with robust parse.
- **cache**: `compactMarkdown`, `queryHash`, `jaccardSimilar`, atomic I/O,
  MCP `extractText`.
- **freshness**: `isDocConsulted` (Context7 + Exa), trivial-edit counter.
- **refs**: frontmatter parsing, glob→regex, SOLID reference scoring/routing.
- **state**: directory locks, daily APEX state, task.json helpers.
- **memory**: per-project lessons throttle + multi-project registry by git root.
- **statusline**: formatters, ANSI colors, progress/gradient bars.
- **util**: compact-json, `.git`-first project root, atomic JSON I/O, hashing.
- **adapters/claude**: stdin → policy → `hookSpecificOutput`.
- README, docs/, CI (`bun test` + `tsc` on every PR). 48 tests, 0 type errors.

### Notes
- Bun-native: `exports` points at TS source, no build step.
- Ported verbatim from the fusengine Claude Code plugins (TypeScript + Python).
