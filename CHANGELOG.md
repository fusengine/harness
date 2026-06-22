# Changelog

All notable changes to `@fusengine/harness`. Format: [Keep a Changelog](https://keepachangelog.com), [SemVer](https://semver.org).

## [Unreleased]

### Planned
- MCP path in the dispatcher: verbosity cap (input mutation) + cache-lookup gate
- Trusted Publishing (OIDC) once the repo is public, to drop `NPM_TOKEN`

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
