# Changelog

All notable changes to `@fusengine/harness`. Format: [Keep a Changelog](https://keepachangelog.com), [SemVer](https://semver.org).

## [Unreleased]

### Planned
- A session-tracking layer (record agent/doc/ref activity) to feed `evaluateApex`
  end-to-end per harness — the remaining piece for full Claude-plugin parity
- Trusted Publishing (OIDC) once the repo is public, to drop `NPM_TOKEN`
- typedoc-generated API reference

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
