# Changelog

All notable changes to `@fusengine/harness`. Format: [Keep a Changelog](https://keepachangelog.com), [SemVer](https://semver.org).

## [Unreleased]

### Planned
- `adapters/cursor`, `adapters/cline`, `adapters/gemini` (hook-mode shims)
- `bin/` CLI entry for cli-mode harnesses (Aider, Windsurf, OpenHands)
- typedoc-generated API reference

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
