# Changelog

All notable changes to `@fusengine/harness`. Format: [Keep a Changelog](https://keepachangelog.com), [SemVer](https://semver.org).

## [0.1.77] - 18-07-2026

### Fixed

- **`TeammateIdle`/`TaskCompleted` "Invalid input" hook error** — both events reject `hookSpecificOutput` (contextResponse) on Claude Code 2.1.214; `teammate-idle-check.ts`, `teammate-idle.ts`, and `task-completed.ts` now ride the advisory, non-blocking `systemMessage` channel instead (the `Stop` path, which does accept `additionalContext`, is unchanged).
- **`PostToolUse` hook stamped as `PreToolUse`** — `respond()` gains an `event` param (default `"PreToolUse"`) propagated to all 4 branches; `handle-post.ts` now passes `"PostToolUse"` so `hookEventName` in the rendered stdout matches the event that actually fired.
- **Silent rules/context injection** — `attachSystemMessage` now merges (`\n`-joined) instead of overwriting when called more than once on the same stdout; `inject-rules.ts`, `inject-context.ts`, `session-start.ts`, and `lessons/dispatch.ts` (new `UserPromptSubmit` case) each attach a sober confirmation notice ("rules 00-08 injected", "CLAUDE.md injected", "lessons injected") so every prompt visibly confirms what was loaded.

## [0.1.76] - 17-07-2026

### Fixed

- **Design-system gate messages name the exact tool call** — the two `deny()` recovery messages in `designSystemWriteGate` now point explicitly at `mcp__fuse-browser__browser_screenshot` and note that `browser_shots_batch`/`browser_site_shots` do not count toward the screenshot quota nor advance the phase. Text-only; no change to gate logic, thresholds, or conditions.

## [0.1.75] - 17-07-2026

### Added

- **SOLID gates for Go and Rust** (`goGate`/`rustGate` in `framework-solid-gates-systems.ts`) — the framework-SOLID pipeline now covers systems languages alongside react/next/laravel/swift.
- **Module-aware interface placement** (`module-layout.ts`) — when an edited path sits under `modules/<name>/`, the 6 gates (react/next/laravel/swift/go/rust) now suggest the idiomatic per-module subfolder (`interfaces/`, `Contracts/`, `Protocols/`) instead of the flat project-root convention.

### Fixed

- **Auto-gate self-block** — `isSelfGateSourcePath` exempts the gate's own 2 source files by exact filename, so the SOLID gate no longer blocks edits to itself while detection on real code (e.g. a `.tsx` with a top-level interface) stays intact.

## [0.1.74] - 16-07-2026

### Fixed

- **`browserNavigateGate` no longer blocks localhost/file:// in phase >=2** — the `KNOWN_DOMAINS` catalog check now applies only during `state.currentPhase === 1` (inspiration browsing). It previously denied every `browser_navigate`/`browser_screenshot` call outside the catalog regardless of phase, which blocked design-review's visual pass (localhost/file:// URLs) in later phases.
- **`dispatchAipilot` cache home is now injectable** — new 5th param `home: string = homedir()`, threaded through the SubagentStart/SubagentStop cache handlers. Backward compatible (the sole prod call site relies on the default); lets tests isolate the lessons cache under a throwaway home dir instead of reading/writing the real machine-wide cache.

## [0.1.73] - 13-07-2026

### Fixed

- **Design pipeline: purge dead references to renamed skills** — the design gates still pointed at old numbered skill folders (`0-identity-system`, `1-designing-systems`) that were renamed to `design-system` / `design-web`. `transitions.recordRead` matched the substring `identity-system`, which no live skill carries anymore, so `currentPhase` never advanced past 0 and `browserNavigateGate` **denied every `browser_navigate` / `browser_screenshot` call forever**. The phase detector now matches `design-system/SKILL.md` (tightened to avoid over-matching the generated `design-system.md` output file), and `skill-triggers.ts` `readFragment`s/labels + `skill-gate.ts` `DESIGN_SKILL_RE`/message are realigned to the 9 real skill names.
- **Hermetic file-size tests** — 15 tests hardcoded ~150-line fixtures assuming the default 100-line ceiling, so they failed whenever `FUSE_SOLID_MAX_LINES` was overridden (e.g. `=200` from `~/.claude/.env`) and leaked into `bun test`. Fixtures now derive their size from the same exported `resolveMaxLines()` resolver the gate uses (`resolveMaxLines() + 50`); the suite is green for `FUSE_SOLID_MAX_LINES` = 100 / 200 / 300 / unset. No production code changed.

## [0.1.72] - 12-07-2026

### Fixed

- **Real `hookEventName` in rules injection** — `injectRules()` hardcoded `contextResponse("SessionStart", …)` (a verbatim port of the Python original), so the `claude-rules` scope emitted `hookEventName:"SessionStart"` on `UserPromptSubmit` and `SubagentStart` too. Per the Claude Code hooks spec the field must match the actual event, and a mismatched value risks being dropped on those non-SessionStart events (the ones that carry rules persistence per prompt / per sub-agent). `injectRules(pluginRoot, event)` now emits `contextResponse(event, …)`, and `dispatch.ts` passes `input.event` at its three call sites. Research confirmed the hardcode is not load-bearing (persistence is decided by *when* the hook fires, not the label), so this is spec conformance with no behavioral regression; `SessionStart` output is unchanged.

## [0.1.71] - 12-07-2026

### Fixed

- **Dynamic project-aware framework detection** — the framework of an edited file is now resolved from the real project on disk intersected with the file's own signal, replacing the extension-only classifier that labelled every `.ts` file "react" (because `\.tsx?$` also matches `.ts`). A backend/test/script `.ts` no longer wrongly demands react SOLID refs. New `nearest-manifest.ts` (walk-up to the closest `package.json`/`composer.json`/`Package.swift` + `projectCaps` reading `dependencies`/`devDependencies`, reusing `detectProjectType` for non-JS langs); `detect-framework.ts` becomes `fileSignal` + `reconcile` (`.tsx`/`.jsx`→react/next only if the project is capable, `.ts`/`.js`→framework only when capable AND a content signal is present, else `generic`; non-JS extensions stay definitive; fail-open to `generic`). The twin `.ts`→react bug in `file-size-scope.ts` (`resolveSolidRefFramework`) routes through the same resolver. No new labels, no cache. `handle.ts` interfaces extracted to `handle-types.ts` to stay under 100 lines.

## [0.1.70] - 12-07-2026

### Added

- **`--sound <kind>` CLI short-circuit** (`hook-sound.ts`): the `hook` command now accepts `--sound stop|permission|human` (as `--sound X` or `--sound=X`), plays the embedded sound via `notify(kind)` and exits 0 without reading stdin or entering `handleHook`. This lets a plugin's hooks.json route every notification sound through the harness **exclusively** (single sound source) instead of native `afplay` — Claude already routes by `matcher`, so each hook line passes the sound explicitly (`PermissionRequest`/`permission_prompt`→permission, `idle_prompt`/`elicitation_dialog`→human). Fail-closed on absent/unknown kind (falls through to the normal flow); harness-agnostic (no `id` gate → codex/cursor/hermes call it identically). Creates the previously-missing `notify("permission")` call site. `bin.ts` gains one logic line (97 l., < 100); `dispatchLifecycle`/`notifications.ts`/`notification-sound.ts` untouched. 11 new tests; full suite 672 pass / 0 fail, `tsc --noEmit` clean.

## [0.1.69] - 11-07-2026

### Added

- Codex functional parity — the harness now governs Codex like Claude Code, all new behavior gated `id === "codex"` (claude-code/cursor/hermes byte-identical, proven by the 36 pre-existing sim scenarios replayed unchanged against the dist binary):
  - **apply_patch fan-out** (`post-fanout.ts`): PostToolUse reaches the post-handlers per patched file (add→Write, update→Edit, delete/move no-op); `normalize.ts` stops force-phasing apply_patch to "pre" so PostToolUse events route to handlePost. Non-apply_patch tools keep strict event identity.
  - **Lifecycle**: Stop dispatched per scope (`stop-core.ts`, the Codex path lacking SessionEnd/TaskCompleted); `designLifecycle` extended to codex; SessionStart resync of agent/command TOMLs under codex (`codex-resync/`, O_EXCL `wx` lock, sha256 fingerprint idempotence, fail-open, writes only under `$CODEX_HOME`).
  - **Tracking/security**: Codex PostToolUse failures classified (`codex-post-failure.ts`); shell reads of refs credited (cat/head/tail/sed/rg/less/more/bat incl. `sh -c`, `sed -i` excluded); `securityAdvisory` fans out per patched file and returns `additionalContext` only (never a bare `permissionDecision:"allow"`, which Codex rejects).
- **Notification sounds** — portable, on by default (`FUSE_HARNESS_SOUND=0` to mute), bundled in `assets/song/` (finish/permission-need/need-human), resolved by package walk-up (works from src and flattened dist chunks) with `FUSE_HARNESS_SOUND_STOP/PERMISSION/HUMAN` overrides and a `$CLAUDE_PLUGIN_ROOT/song` fallback; absolute fail-open. Wired only where events reach the harness (Stop=Codex path, TeammateIdle) — Claude keeps its native afplay hooks, no double-sound.

### Changed

- `evaluate.ts` split: the two git gates extracted verbatim into `git-gates.ts` (SRP, evaluate.ts back under 100 lines) — byte-identical prompts. Clears the 0.1.68 line-count debt.

## [0.1.68] - 11-07-2026

### Fixed

- File-size gate remediation deadlock: an Edit on a file already over `FUSE_SOLID_MAX_LINES` was ALWAYS denied (the gate judged `Math.max(new_string, on-disk)` — the on-disk count won every time), so an oversized file could never be shrunk or split via Edit. The gate now computes the REAL post-edit line count (`existing − old_string + new_string`, scaled by occurrences under `replace_all`, fail-closed when `old_string` doesn't match): a shrinking Edit of an oversized file is allowed (monotonic convergence — growth stays impossible), and a computable violation is denied on the real outcome, which also closes the historical grow-via-Edit hole (a compliant 95-line file pushed to 106 by an Edit used to pass unseen). Write and apply_patch behavior unchanged. 8 invariant regression tests + sim scenario 33 on the real binary.

### Known debt (accepted)

- `src/policy/evaluate.ts` temporarily at 103 lines (> 100): the compacted version + SRP git-gates extraction are ready but blocked by the deployed harness's own Edit deadlock — the exact bug this release fixes. Follow-up lands right after the deployed harness syncs to this version.

## [0.1.67] - 11-07-2026

### Added

- Codex multi_agent_v2 custom agents now count as agent evidence: on PostToolUse under Codex, a `spawn_agent` call carrying `tool_input.agent_type` (exposed when `hide_spawn_agent_metadata=false`) is recorded as `subagent-<agent_type>` in the SAME SessionTrack as Claude Task evidence — APEX freshness gates see a Codex explore-codebase/sniper exactly like a Claude subagent. Detection covers both proven tool-name forms (openai/codex@44918ea1): canonical `spawn_agent` and the no-separator `{namespace}spawn_agent` concatenation (`fusengine_agentsspawn_agent`). Triple gate against false credits (codex id + spawn form + non-empty agent_type); claude-code/cursor/cline/gemini paths byte-identical (sim parity scenario 32b, stash-replay proven).

## [0.1.66] - 10-07-2026

### Added

- Plain `git push` joins the auto-approved subset under Codex `approval_policy=never` (NEVER_SAFE = RALPH_SAFE + `git push`, visible `[fuse-harness] Auto-approved …` notice) — pushing is the agent's job in that mode and the approval prompt cannot exist. Codex `bypassPermissions` ONLY: Claude Code and RALPH paths are byte-identical (patterns.ts untouched, parity scenario green). Destructive forms still deny via `isSafePushForm`: `--delete`/`-d`, `--mirror`, `--prune`, refspec deletion (`git push origin :branch`), and the flagless `+refspec` force-push (`git push origin +main` — git-push(1): leading `+` ≡ `--force`), on top of the pre-existing `--force`/`-f`/`--force-with-lease` block. No false positive on `feature+x` tokens or `host:port` URLs; `--force-if-includes` alone is a documented no-op and stays approved; chaining remains fail-closed.

## [0.1.65] - 10-07-2026

### Added

- Codex `approval_policy=never` is now handled instead of dead-ending: the RALPH_SAFE git subset (checkout -b / add / commit / status / diff / log) auto-approves with a VISIBLE `[fuse-harness] Auto-approved …` notice when the hook payload's resolved `permission_mode` is `"bypassPermissions"` (the only value Codex maps from `AskForApproval::Never` — verified at openai/codex@342e4d4b, regression-marker test). Three hard conditions: safe prefix, no destructive match anywhere in the string, single command only (chaining rejected: `&&`, `||`, `;`, `|`, lone background `&` with a bash-redirect exclusion, backticks, `$(`, newlines — quote-unaware fail-closed). RALPH_MODE keeps priority (silent). Claude Code's own bypassPermissions mode is untouched (sim-proven); everything outside the safe subset keeps the existing ask→deny downgrade.

### Security

- `~/.codex/config.toml` and `.codex/rules/` are now write-protected on every harness — an agent can no longer self-grant the never exemption by rewriting Codex's own approval config or authoring an allow rule (Codex's sandbox does not cover user-level `.codex` under danger-full-access).

## [0.1.64] - 10-07-2026

### Fixed

- Linux-only total silence of the hook CLI (all 25 sim scenarios red on CI while green on macOS): a Bun Linux stdin-init ordering bug (oven-sh/bun#25320/#27849) — adding `figures` as the package's first runtime dependency shifted `process.stdin` initialization, and the `for await` stdin loop silently read empty, so every hook ran on an empty payload (stdout "", exit 0, no error). `readStdin` now uses a synchronous fd-0 read (`readFileSync(0)`), shared via `util/runtime-io.ts`. A permanent env-gated stderr tracer (`FUSE_HARNESS_DEBUG=1`, set by the simulator's spawn env) makes any future silent child speak in every scenario failure — CI and local alike. Root cause proven by the tracer's live CI trace (`stdin-text-length: 0` on 25/25).

### Added

- Every deny/ask gate outcome now carries a user-visible `systemMessage` (`✘ <gate title>` / `? <gate title>` via the `figures` package — text-presentation symbols, Windows fallbacks, never emoji) on claude-code/codex, deduped across the ~11 sibling-plugin fan-out (`onceExclusive`, 2s burst window, re-emission after the window proven by test). All THREE deny return points in handle-pre.ts are covered (designGate, applyPatchGate, main gate) — the owner watched agents obey blocks that were invisible in the TUI since 0.1.57 equipped only the allow path. The agent channel (`permissionDecision`/`permissionDecisionReason`) is byte-identical (stdin-proven on all three paths); cursor/hermes/cline pass through untouched (cursor already emits its native `user_message`); notice attachment is fail-open — any FS error still ships the untouched deny decision.

## [0.1.63] - 10-07-2026

### Fixed

- The per-prompt APEX condensate (buildApexInstruction) now lists all 6 phases — eLICIT (named-technique self-review) and VERIFY (functional check) were omitted, so leads followed the injected 4-phase text and skipped both; an explicit gate line ("eLicit + Verify BEFORE sniper — NEVER skip") is appended. The tracking-file line no longer claims `/apex` creates `.claude/apex/task.json` (no code path ever creates it — proven by grep of sync-task/apex-task-store): the agent is instructed to create it via apex-methodology Step 0. The SubagentStart "APEX Sub-Agent Instructions" gain a "Before Done (NEVER skip)" eLicit/Verify section. `dispatchLifecycle` routes scope `rules` on SubagentStart (mirroring SessionStart; previously fell through to the MCP cache default — inert in prod until claude-rules registers that hook). Fresh-build behavioral diff across all 34 event×scope pairs: only the two intended outputs changed. Companion audit claim "PreToolUse gates don't fire inside Task-tool subagents" investigated and REFUTED (docs agent_id/agent_type, maintainer test closing anthropics/claude-code#21460, live repro) — no disk-artifact migration needed.

## [0.1.62] - 09-07-2026

### Fixed

- Destructive git flag patterns no longer match as bare substrings of arguments: `-f`/`--force`/`--force-with-lease`, `--hard`, `-D` and the `git clean` f+d short-cluster now anchor on token boundaries (leading space, trailing space/`=`/end), so a branch named `fix/guard-false-positives` pushes normally (3rd live repro closed) while `-fd`, `-df`, `-fdx`, `-xfd` clusters stay denied. Sim scenario 27 locks both directions.
- `solidReadGate` now credits a SOLID ref read performed through a DIFFERENT root than the marketplace-first path it expects: new `refs/ref-key.ts` normalizes recognized skill paths (config-dir-anchored marketplace/version-cache trees, standalone `.claude|.codex|.cursor|.agents/skills`, `/etc/codex/skills`) to their `skills/<skill>/…` suffix before comparison. Closes the "sub-agent/teammate reads the versioned cache path (`fuse-solid/1.0.12/skills/…`), gate expects the marketplace path (`plugins/solid/skills/…`), never credited" gap. Exact-match check stays first (lead behavior byte-identical, strictly additive); forged paths outside recognized roots never credit by suffix (sniper-tightened anchoring + regression tests). +10 tests (545 pass), sim 31/31.

## [0.1.61] - 07-07-2026

### Fixed

- Closed a total fail-open on Codex: `tool_input.command` arrives as an ARRAY (`["bash","-lc","…"]`) on Codex, and `normalize.ts` silently dropped non-string commands (`str()` → undefined), so every command gate (git blocked/ask, mutators, RALPH exemptions) allowed anything. New `runtime/command-string.ts` normalizer (string passthrough; `[shell, -c|-lc, script]` → script; other string arrays → joined) wired into `normalizeEvent` and the codex/claude/hermes adapters. Array and string payloads now produce byte-identical verdicts (proven by replay); string behavior is a strict no-op (full suite unchanged: 535 pass). New sim scenario 26 (codex array-form deny) + unit/pipeline tests.

## [0.1.60] - 06-07-2026

### Fixed

- Closed the env/wrapper-prefix mutator bypass (previously a documented "accepted gap"): code mutators (sed/perl/awk in-place, patch, tee/dd into code files) are detected BEFORE the SAFE_PREFIXES short-circuit, so `env sed -i src/foo.ts`, `timeout 5 patch`, `cp a b; tee src/x.ts` now deny. Every pattern is command-position anchored via a shared CMD anchor (`bash-command-anchor.ts`) — a quoted MENTION (`git commit -m "fix sed -i doc"`, `--grep "sed -i"`) still passes, locked by explicit negative tests. Sim scenarios 24 (claude-code) + 25 (codex); the 27 pre-existing scenarios stay green in both modes. Documented residual: bare `--` end-of-options wrapper form (owner-accepted follow-up).

## [0.1.59] - 06-07-2026

### Fixed

- SubagentStop no longer demands sniper validation on files the agent deleted before stopping (scratch probes, temp dirs): the owned list is filtered against the disk (`existsSync(resolve(hookCwd, f))`) before the reminder; all gone → the "no code changes" path. TeammateIdle audited and confirmed not affected (already stats the disk). Found by the 0.1.58 live test.
- notices.ts documents the channel contract: `userMessage`/`systemMessage` is human-only (excluded from formatPrompt, never reaches the agent) and emitted exactly once under the multi-plugin fan-out via onceExclusive — verified live 2026-07-06. Settles the "invisible notice" report as by-design (no code change; an agent-debate judge's differential probe overturned the initial fix verdict).
- Tests: stale-file scenarios moved to a dedicated `agent-memory-stop.test.ts` with real on-disk fixtures plus two new cases (deleted-before-stop → silent; mixed present+deleted → only survivors listed); parity-freshness/receipts now create their fixture files on disk.

## [0.1.58] - 06-07-2026

### Added

- Codex `apply_patch` is now gated (it was 0% — enforcement theatre on Codex's PRIMARY edit primitive): the patch text is parsed per file (`adapters/codex/apply-patch.ts`), each hunk runs the file gates (protected-path, file-size, DRY) and ONE violating hunk denies the whole patch (`runtime/apply-patch-gate.ts`) — a compliant file can no longer smuggle an oversized one through. Codex `ask` prompts downgrade to an explicit deny (it fails open on unsupported shapes). Sim scenarios 22-23.
- Multi-harness simulator: scenarios carry an optional `harness` field (validated against the real id list, defaults to `claude-code`) replayed via `hook <harness>`; new scenarios 19-23 exercise codex/cursor/hermes end-to-end, so the shared-guards invariant is mechanically CI-locked. Hermes live-test protocol documented (`docs/hermes-live-test.md`).
- Global injection budget recap (one user-visible line per SessionStart/SubagentStart tallying all injected fragments) and a strictly-once sniper reminder (exclusive-create dedup + bounded purge, replaces the residual 2-3× fan-out duplicate).

### Fixed

- Teammate ref-read gap: the on-disk transcript flushes ~230s late (beyond the freshness TTL), so a teammate's just-read SOLID ref was invisible to the transcript reconcile while its live track write was lost to the fan-out race — teammates had to delegate their writes. `gate()` now also reconciles refs from an append-only journal (`ref-journal.ts`, `O_APPEND` — race-immune AND fresh), trimmed to a 128KB bound on the shared state dir.
- Cursor `afterFileEdit` is now advisory-only: it returns `allow` + a `user_message` correction on a violation instead of a `deny` that has no proven upstream effect (the hook launched "informational only"; Cursor's deny-enforcement for file operations is confirmed broken upstream, forum.cursor.com/t/154377). `deny` stays reserved to the proven `beforeShellExecution` path.
- bash-write false positive: `patch` matched as a bare word (blocking read-only commands merely naming a path, e.g. `jq . apply-patch.json`); now matched only as a command token.
- Docs: README + adapters compatibility matrix updated to the real per-harness ceilings with upstream sources (Codex #27833, Cursor forum #154377).

## [0.1.57] - 06-07-2026

### Added

- Failure-time lessons (`PostToolUseFailure`, Claude-Code-only): a failing tool call is matched against the lesson `[TRIGGERS error:]` regexes and THE matching lesson is injected at the moment of the error; failures land in the one-shot sidecar (additive `failures` field). Sim scenario 17.
- Teammate-idle deliverable check (`TeammateIdle`, Claude-Code-only): on a teammate's idle, its announced deliverables (harvested `modifiedFiles`) are stat'ed on disk — a missing one warns the lead "verify before treating as done". The idle≠done discipline, mechanized.
- Post-compact reinjection (`PostCompact`, core scope): reconciliation snapshot + "context was compacted — reread files before editing" reminder, burst-deduped. Sim scenario 18.
- Injection budget: every harness-produced fragment (lessons, snapshot, apex-task, dev-context, apex-subagent) is hard-capped at 8000 chars with a located truncation notice; the owner's CLAUDE.md context is exempt by test-locked invariant.
- Compliance notices (user-visible `systemMessage`): `✓ SOLID refs read`, `✓ evidence fresh — explore+research`, `⚠ sniper required: <file>` — burst-deduped per session, no-op on harnesses without the channel.
- Honest documentation: README + adapters/policy/runtime/config/index rewritten — compatibility matrix with per-harness limits (file:line cited), dual state roots documented, every feature claim backed by a cited test or sim scenario; ROADMAP swept against reality (6 stale items closed with proof).

### Fixed

- Codex adapter comments now state the real coverage (`apply_patch` edits gated at 0% — parser on the roadmap) and guard against wiring Codex `PermissionRequest` until `respond()` emits its wire shape; Claude-Code-only docstrings on non-portable features.
- Simulator: explicit 30s per-scenario test timeout (kills the bun 5s-default flake vector under load; the 2s burst window itself has ×23 measured margin).

## [0.1.56] - 06-07-2026

### Fixed

- Lead `refsRead` credit (root-caused with live data): `saveTrack` does an unlocked load→mutate→write, so under the ~11-process hook fan-out a ref read recorded ONCE was lost with ~100% probability while agents/doc evidence self-healed on later writes — the lead could read every listed SOLID ref and never satisfy `solidReadGate` (subagents were unaffected: SubagentStop already harvests their transcript). `gate()` now reconciles `.md` Reads from the session transcript (append-only, race-immune) into `refsRead` before any consumer — never downgrades a newer stamp, fail-open, TTL semantics unchanged. Regression test proves lost-write → BLOCK → reconcile → PASS, and stale reads stay blocked.
- Lesson compression: the rule separator is a SPACED arrow only — a glued arrow (`120s→300s`) is prose; short trailing asides are dropped without losing in-prose arrows. Fixes the last 2/40 mid-token compressed bullets found by the live test.
- Residual 2× sniper reminder documented as an accepted tradeoff (a per-key exclusive-create dedup would need its own purge sweep — separate batch if ever needed).

## [0.1.55] - 05-07-2026

### Fixed

- Per-event dedup of counters and reminders (found by a live subagent test on deployed v0.1.54): ~11 deployed plugins each invoke the binary on the SAME tool event, so the deny-loop counter jumped +11 per real attempt ("Identical attempt #9" on an agent's FIRST try), the one-shot metric was inflated 11x and the sniper reminder was injected ~15x per edit. Counters are now keyed `(op-hash + session_id)` over a 2s burst window (`burst-window.ts`); sibling fan-out processes get the prior verdict VERBATIM (one consistent count) and different sessions never dedup each other; the reminder is emitted once per (file + session + window) via the shared `oncePerWindow` sidecar.
- Readable lesson compression: the distilled one-line rule is now the longest segment after an arrow with a 40-char minimum (fallback: the full rule's first sentence) — no more truncated fragments.

### Added

- Simulator: per-step `delayMs` (validated at load, 4s bound — `bun test` kills a test at 5s) so scenarios can distinguish a genuine agent retry from a hook fan-out burst; scenario 03 rewritten (a spaced retry escalates to `#2`), scenario 16 proves the burst collapse end-to-end in src and dist CI modes; `load.ts` split (SRP) into `load.ts` + `validate.ts`.

## [0.1.54] - 05-07-2026

### Added

- Two-stage LESSON.md compactor: beyond the 50-bullet cap the oldest bullets are MOVED (never deleted) to `MEMORY/LESSON-archive.md` (archive-first, atomic, fail-safe); `[TRIGGERS]` bullets stay until >90d so the decision-time index keeps working. The SessionStart/SubagentStart injection is compressed mechanically — the 10 most recent bullets go in full, every older one is reduced to its dated actionable rule — a measured **73.5% token reduction** (103.6kB → 27.5kB) on a real 121-bullet file, while the file itself keeps full bullets. Project isolation (each session receives only its own project's LESSON.md) is now test-locked; sim scenario 15 covers the compressed injection in src and dist CI modes.

### Fixed

- English-only emitted strings: the deny-loop `[REPEAT]` message, curation/merge/archive reports, MCP cache-hit text and the subagent cache injection block had shipped in French (leaked from French-language teammate briefs and the original Python port). All harness-emitted strings are now English; French-detection regexes (prompt classification, lesson tokenization) are intentionally kept.

## [0.1.53] - 05-07-2026

### Added

- Reconciliation snapshot at core SessionStart: git state (branch, recent commits, WIP counters), running harness version with drift warning, persistent `.claude/BOARD.md` rehydration and the one-shot gate summary — offline-only collectors, each isolated fail-safe, concatenated onto the existing injected context (the CLAUDE.md invariant is never violated, even on unparseable stdout).
- One-shot gate metric: every gate outcome lands in a 7-day pruned sidecar (`one-shot.json`, deny-loop-store pattern); a deny and its later fix link through a content-free op key so the deny→allow transition is visible; `oneShotSummary(cwd)` derives the state dir with the exact `defaultStateDir(cwd)` the writer uses (single shared path deriver — a wired-but-dead seam caught during the batch).
- Simulator: optional per-scenario `setup` files (validated, `$TMP`-contained) so E2E scenarios can materialize project roots; scenarios 13 (multi-session Stop scoping — fails on the pre-fix code) and 14 (snapshot) run in both src and dist CI modes.

### Fixed

- Lessons Stop reminder cross-session leak (production bug): with 2-3 concurrent sessions the reminder listed ANOTHER session's project and consumed its throttle, sending lessons to the wrong LESSON.md. Reminders are now keyed per `(session_id, root)` in a pruned home-cache registry; the legacy path (no session id, old state format) is preserved and test-covered.

## [0.1.52] - 05-07-2026

### Added

- Hook simulator (`test/sim/`): a 12-scenario corpus of full hook-event sequences (payload on stdin → expected verdict on stdout) replayed against the REAL binary — `bun src/cli/bin.ts` locally and `node dist/cli/bin.mjs` (`SIM_BIN`) in CI after a build. Each scenario runs in a fresh `$TMP` (HOME=cwd) with a scrubbed env, shared across its steps so on-disk session state persists: block → comply → pass, deny-loop `[REPEAT]`, TaskCompleted receipt refusal, SubagentStop evidence harvest, session isolation, git ask/deny, SKILL.md tolerance and solid-scope routing are all exercised end-to-end. Kills the "ported but never wired" and "works from src, broken in dist" classes — the dist mode caught a real relative-path spawn bug before this ever merged.
- CI: `Build` + `SIM_BIN=dist/cli/bin.mjs bun test test/sim/` steps; `bun run sim` script. Guards: a present-but-empty scenario dir fails red (no silent green), malformed stdout matchers are rejected at load with a located error.

## [0.1.51] - 03-07-2026

### Added

- Verification receipts: `tsc`/`bun test` runs are captured as receipts in the signed SessionTrack (PostToolUse Bash parse); TaskCompleted now REFUSES a "done" (`{"continue":false,"stopReason"}` — the only documented refusal shape for this event) when code files changed without a fresh passing receipt; SubagentStop appends an advisory "NO VERIFICATION RECEIPT" note to the attributed reminder. Kills the declared-done-but-broken pattern (3 live occurrences this week).
- Deny-loop breaker: every gate deny is hashed (stable, key-order-free) into a state sidecar; an identical retried call gets a rewritten "[REPEAT] … STOP" message with a mandated research-expert action — the decision itself is never changed, allows are never touched, hashes expire with the freshness window.
- SubagentStop evidence harvest: the finishing sub-agent's own transcript (`agent_transcript_path`) is parsed and its research/explore calls + `.md` ref reads are backfilled into the session track BEFORE the reminder — the freshness gate now sees sidechain evidence even when sidechain PostToolUse hooks never fire (platform issues #43612/#27655/#34692). Transcript parser factored into `agent-transcript.ts`, shared with the v0.1.50 attribution.

## [0.1.50] - 03-07-2026

### Added

- Decision-time lessons: a `MEMORY/LESSON.md` bullet may end with a `[TRIGGERS tool:… path:… error:… keyword:…]` line; the single most-specific matching lesson is injected as `additionalContext` at the exact PreToolUse about to repeat a known mistake — allow-path only (never masks a deny/ask), cooldown-guarded (30min via the shared `oncePerWindow`), backward compatible (untagged bullets keep the SessionStart block).
- Lesson curation on read: strict near-duplicate merge (the removed twin's `[TRIGGERS]` line is carried over), >50-bullet cap and >90-day stale paths reported to the user via `systemMessage`; `LESSON.md` is rewritten only on real merges.
- Context-injection dedup guard: `oncePerWindow` (state-backed sidecar) suppresses only a same-turn double-fire of an identical CLAUDE.md block; the invariant "CLAUDE.md injected on EVERY message" is CI-guarded (`claudeMdKey` shared between prod and tests).

### Fixed

- SubagentStop attribution: the sniper reminder now lists only the files the stopping agent actually wrote (parsed from its own `agent_transcript_path`, null-safe fallback to the session-wide list) and the cumulative counter survives non-authors — reproduced 3× live, including a research-only agent ordered to validate 14 foreign files.
- SOLID: `handle-pre` allow-path extracted to `pre-allow.ts` (87/40 lines).

## [0.1.49] - 02-07-2026

### Added

- Per-framework skill authorization (Check 1, parity `enforce-apex-phases.ts`): `doc_consulted` stamped per framework and re-validated against `FUSE_ENFORCE_TTL_SEC` on every edit; a deny writes a persistent `target` cross-credited on EVERY later consultation (parity `track-doc-consultation.py` — no TTL, no single-shot clear, kills the deny→consult→re-deny loop). Trivial-edit budget (5th small Edit in the window requires full APEX; `replace_all` never trivial). `PROTECTED_PATHS` denied early in `gate()` on ALL extensions with the byte-for-byte Python message.
- Session-scoped agent evidence (parity `track-subagent-research.py`): research/explore tool calls are persisted into the signed `SessionTrack` keyed by `session_id` — sub-agent and workflow-agent research now satisfies the freshness gate; the lead-transcript scan is demoted to fallback.
- Doc consultations credited to the framework named in the QUERY (`track_doc_helpers.detect_framework` keyword map, 9 verbatim regexes) instead of always `generic`.
- `Prompt.userMessage` channel (parity `hook_output.allow_pass`/`post_pass`): user-visible pass notices per harness — claude/codex `systemMessage`, gemini `systemMessage`, cursor `user_message` (snake_case, camelCase silently ignored — cursor forum #141516/#142589), cline/hermes documented drop. Design-pipeline and solid-detect notices restored.
- Hermes adapter: `~/.hermes` home, `HERMES_SESSION_ID` detection, `{decision:"block",reason}`/`{context}` protocol (Claude-style output accepted natively by Hermes), wired in `respond()` + build exports.
- `fuse-browser` network tools added to `RESEARCH_TOOLS` — the deny message already promised them as an accepted fallback but the freshness table never credited them.
- Check-1 deny sources resolved dynamically (`skill-source.ts`, 10-entry map + context7 fallback): a deny never promises a nonexistent SKILL.md path.

## [0.1.48] - 02-07-2026

### Fixed

- SOLID-read TTL was inert: `refsRead` had no timestamps, so a single skill read satisfied `solidReadGate` for the whole session while its message claimed "(expires every 2min)". Every `.md` read is now stamped (`refsReadAt`) and re-validated against `FUSE_ENFORCE_TTL_SEC` (120s) on every edit — parity `require-solid-read.py`/`track-solid-reads.py`. TTL confined to `solidReadGate` (Python TTL-izes SOLID reads exclusively); pre-TTL tracks stay valid (unstamped paths count).
- `handle-pre`: the `solid` scope now always returns after `validateSolidGate` (mirror of `security`) — no more double `gate()` run per edit when core-guards and solid both wire PreToolUse, and no more over-policing Bash (the Python solid plugin never gated Bash).
- `explore-tools`: reading a real TS cache file (`<root>/.harness/cache` or `~/.fuse-harness/cache`) now credits research-expert; only the legacy Python cache names (`context7-…`) were recognized.
- Tests: +7 (6 `parity-b4-*` files + a wiring guard asserting `recordActivity` forwards `ts` into `refsReadAt` — the one-word link the whole TTL hangs on, missed by the integrator and caught by the adversarial review).

## [0.1.47] - 2026-07-01

### Added

- Tailwind base-skill gate (ports `check-tailwind-skill.py` Phase 1): a `.tsx/.jsx` write with Tailwind utility classes now requires a `tailwindcss-v4`/`tailwindcss-utilities` skill read this session.
- Opt-in Gemini Design MCP gate (`FUSE_ENFORCE_GEMINI_MCP`, default off): blocks hand-written Tailwind UI until a `mcp__gemini-design__*` call is made.
- Ralph mode (`RALPH_MODE`, env-only, default off): exempts safe git commands from the confirmation ask and auto-approves project installs; destructive git and system installs still gate. The Python source's silent `feature/*`-branch / `prd.json` auto-activation is intentionally dropped.

### Fixed

- `detect-framework`: complete the Next.js signal set (`NextRequest`/`NextResponse`/`getServerSideProps`/`middleware`) so Next.js files stop mis-classifying as react.
- `framework-solid-exclude`: anchor the JS build-dir exclude on path segments so `distance.ts` / `rebuild/` are no longer skipped from SOLID checks.
- `framework-skill-gate`: skip the sub-skill gate on build/vendor artifacts (parity with the Python `check-*-skill.py` early return).
- `security`: accumulate every matched violation (deny when any is critical) and exempt a `trash`-targeted `rm` from the ask.
- APEX gates: exempt subagents from the brainstorm requirement; exempt `.claude/fusengine-cache/` paths; widen the dev-verb trigger to the full `DEV_KEYWORDS`.
- `modular`/`skill-triggers`/`design`: precise FuseCore target sub-path, dedicated FuseCore skill message, dedicated `design-system.md` not-found message.

### Removed

- Dead `src/state/*` (duplicate of `apex-task-store`) and dead `preScreenshotWriteGate` (its `check-browser-browsing.py` source is not wired in any hooks.json; the screenshot quota lives in `designSystemWriteGate`).

## [0.1.46] - 2026-07-01

### Fixed

- `solidReadGate` required the exact `references/*.md` path to be read, unlike the 3 other `refsRead`-consuming gates (`skillTriggerGate`, `shadcnBaseSkillRead`, `designSkillRead`), which already accept reading the skill's parent `SKILL.md` as proof of consultation. Reading only the `SKILL.md` — the natural reflex, and what the gate's own message suggests — satisfied 3 of 4 gates but never this one. Now accepts either.

## [0.1.45] - 2026-07-01

### Fixed

- Design pipeline gates (`stateFileGate`, `htmlCssOnlyGate`, `browserNavigateGate`, `designSystemWriteGate`, `geminiCreateGate`): restored the anti-loop warning + phase sequence, the domain-expert handoff phrase, the 2 distinct SKILL.md paths (phase 0 vs phase 1) + explicit 9-domain inspiration catalog, and numbered RECOVERY steps with explicit MCP tool names — all lost in the initial port (`gates.ts` split into `gates-pipeline.ts` to stay under the SOLID file-size limit).
- MCP/WebFetch cache-hit interception served the raw cached body with no wrapper; restored the `CACHE HIT (~NKB economise, cached il y a Hh): {body}` notice (WebFetch variant differs slightly), parity `webfetch-cache-lookup.py`/`mcp-cache-lookup.py`.
- `shadcn-skill-gate.ts` lost the `mcp__shadcn__search_items_in_registries` unblock option (text AND logic) — restored, with a real live tracking path (`activity.ts`'s `docSourceOf` now recognizes `mcp__shadcn__*` calls as a new `"shadcn-mcp"` doc source, wired end-to-end through the existing `authorizations` pipeline).
- `skill-triggers.ts`'s missing sub-skill message pointed at a relative `skills/<name>/` fragment instead of the real, absolute `SKILL.md` path — restored via a NEW dynamic resolver (`skill-path.ts::resolveSkillPath`) that scans installed marketplace plugins for the skill on disk, rather than a hardcoded framework->plugin-dir table (which would have mis-resolved cross-plugin skills like `react-shadcn`, actually installed under `shadcn-expert`).
- `modular.ts`'s Next.js/FuseCore modular-architecture messages lost 3 fragments: the explicit `app/` convention file list, the "Cores must be independent" rationale, and the word "from" in the cross-module-import message.
- `dry.ts`'s duplicate-file list silently dropped files beyond the first 3 with no indication more existed — now shows `(+N more)` when applicable, parity `detect_duplication.py`.

## [0.1.44] - 2026-07-01

### Added

- `harness scan [dir]`: OWASP security scanner (18 patterns JS/PHP/Python/Swift), ports `security-scan.py`.
- shadcn/ui skill gate: 5 sub-skills (`shadcn-detection/components/theming/registries/migration`) + standalone gate for `components|ui|shadcn|components.json`-scoped writes, independent of the detected framework — ports `shadcn-expert`'s `check-skill-loaded.py` (previously entirely unported).
- `detectPrimitiveLib()`: weighted Radix UI vs Base UI detection (package.json/components.json/imports/data-attrs), ports `detect-primitive-lib.py`.
- `checkFileSize()`: adaptive SOLID file-size warning keyed off the detected project type (`SOLID_FILE_LIMIT`), ports `solid/check-file-size.py` — the limit was computed but never read.
- `checkSolidCompliance()` / `checkSolidFromTranscript()`: ai-pilot PostToolUse/SubagentStop SOLID + interface-location checks, ports `check-solid-compliance.py` / `check-solid-from-transcript.py`.
- `autoDocumentRead()`: auto-generates `.claude/apex/docs/task-<n>-<framework>.md` on a SKILL.md/README/docs Read, ports `auto-document-reads.py`.
- `doc-cache-gate`: PreToolUse deny for a redundant Context7/Exa query when the doc is already cached fresh (<7d).
- `SAFE_PREFIXES` + a harness-owned-path allowlist (`~/.fuse-harness/cache`, `~/.claude/logs`) in the bash-write guard, ports `bash-write-guard.py`'s fast-path + `safe_paths.py`.
- Tailwind utility-class detection on `.tsx`/`.jsx` (in addition to the react/nextjs framework gate, not instead of it) — the previous port only matched `.css`, the inverse of the real use case.
- `countFrameworkCodeLines()`: comment/blank-excluding line counter for the react/nextjs/laravel/swift SOLID gates, ports `validate_solid_common.py::count_code_lines`.
- `validate-solid.ts`: Go interface-location and Python ABC checks (PostToolUse, scope `solid`), ports `validate-solid.py`'s `check_go`/`check_python` (`check_nextjs`/`check_laravel`/`check_swift` deliberately not ported — already covered by `framework-solid-gates.ts`).
- `validate-tailwind.ts`: deprecated `@tailwind` directive / excessive `@apply` / overlong `className` warnings (PostToolUse, new scope `tailwindcss`), ports `validate-tailwind.py`.
- `hasTailwindDependency()`: `tailwindcss` package.json dependency fallback for Tailwind v4 CSS-first projects with no config file, ports `is_tailwind_project`.
- `test/parity-freshness.test.ts`/`test/bash-write.test.ts`: non-regression tests for the `agentsRanFromTranscript` direct-tool-use branch and the `bash-write-safe-paths.ts` hardening.

### Fixed

- **Doc-consultation gate regression**: `isDocConsulted` required only ONE of context7/exa/web (OR); the Python source (`mcp_research_done`) requires BOTH context7 AND exa. Restored to `(context7 AND exa) OR a web fallback alone` — found independently by 3 separate audit teams. The web-alone fallback (WebSearch/WebFetch/fuse-browser) is a deliberate TS addition, not a Python behavior.
- Design-agent lifecycle: `SubagentStop` was gated by the same `agentType.includes("design")` filter as `SubagentStart`, so a Stop event with a missing/different `agent_type` never cleared the `design-agent-active` flag — a stale flag then routed every subsequent top-level Write/Edit through the design-only `htmlCssOnlyGate`. Fixed by clearing the flag purely on `agent_id` match, and by never falling back to the stale flag for a call with no `agent_id`.
- `brainstormGate` no longer requires brainstorming before an `Edit` (parity `require-apex-agents.py`: only `Write` creates new files).
- `bin.ts` no longer imports a non-existent module (a batch-apply ordering issue during this session, caught before it reached a released version).
- SOLID line-counting divergence: the react/nextjs/laravel/swift gates counted raw physical lines instead of excluding blank/comment lines like the Python source — could block a comment-heavy file under the 100-line limit that the source would have allowed. The generic core-guards ceiling (`evaluate.ts`, parity `enforce-file-size.py`) intentionally keeps the raw count — it is a different Python rule.
- `bash-write-safe-paths.ts`: 3 hardenings — `isSafeWritePath`/`isSafeCommandTarget` now require a segment boundary (`target === safe || target.startsWith(safe + "/")`, was an unanchored `startsWith` a sibling directory like `~/.claude/logs2-x/` could match); `resolvePath` now only expands `~` alone or a `~/` prefix per POSIX tilde-prefix semantics (was over-expanding `~user`/`~2xyz`/`~+`); `hasSafeWriteTarget` now requires the safe path to appear as a quoted string literal or quoted sub-path (was an unanchored substring match a `node -e` call could satisfy via an inert comment).
- `agentsRanFromTranscript`: now also credits a direct exploration/research `tool_use` (Glob/Grep, an explore Bash command, mcp__context7/mcp__exa, WebSearch/WebFetch) issued by any sub-agent within the same transcript, not just a nested `Task`/`Agent` invocation — parity `track-subagent-research.py`, which classifies any sub-agent's direct tool call into shared session state unfiltered by author. Reuses the existing `classifyExplore` classifier (previously only wired into the self-recorded track fallback).
- Trivial-edit fast path (skips the APEX gates for a few tiny edits) no longer applies to `Write` — parity `enforce-apex-phases.ts`, which reserves it for `Edit` only (a `Write` always creates/replaces a file wholesale).
- `doc-cache-gate.ts`'s Context7 branch required a non-existent `topic` input field (the real `mcp__context7__query-docs` schema is `{libraryId, query}` — confirmed against the primary upstash/context7 source and this harness's own `cache-doc.ts`/`mcp-key.ts`, both of which already key on `query`), making the redundant-doc-call gate a no-op for every real call. Fixed to check `query`.
- `dryGate`: a single pre-existing duplicate symbol now returns a non-blocking `inform` (parity `detect_duplication.py`'s `allow_pass` for exactly 1 match) instead of being silently swallowed like 0 matches — only 2+ still `block`.
- `effectiveLines` (framework SOLID size check on an `Edit`): the on-disk full-file line-count max was applied uniformly to react/nextjs/laravel/swift; only `validate-nextjs-solid.py` imports `get_full_file_content` in the Python source, so react/laravel/swift now judge the edited snippet alone, matching their real (less strict) Python behavior.
- `freshnessGate`'s deny message lost the Python `AGENT_TTL_LABEL` (e.g. "2min TTL") during the initial port — restored via the existing `ttlLabel`/`DEFAULT_TTL_SEC` helpers, no new formatting logic.
- `DOC_CACHE_TTL_SECONDS` (doc cache freshness, 7d): `inject-doc.ts` and `doc-cache-gate.ts` each defined their own local `TTL_SECONDS` for the same cache — extracted into a single export in `cache-base.ts`, imported by both, to remove the silent-drift risk that caused the `DEFAULT_TTL_SEC`/`DEFAULT_WINDOW_MS` regression above.
- `solidReadGate`'s deny message lost the Python `formatRoutedDeny`'s TTL label, optional refs, and "Full skill:" pointer during the initial port — all 3 restored. Note: `routed.skillPath` is currently always empty in production (`solidReadGate` never threads a resolved skill dir through `ApexContext`) — tracked as a follow-up, not fixed here.
- `evaluateFileSize`'s deny message was reduced to "File has N lines (max: M)." — the Python `enforce-file-size.py` includes the filename, a framework-resolved SOLID reference path, and a 3-step split plan. Restored via new optional `filePath`/`framework` params (backward-compatible defaults).
- `respond.ts`: an `inform` prompt (e.g. `dryGate`'s single-duplicate note) collapsed into a blocking interactive `ask`/`permission:"ask"` in the real production hook pipeline (`gate()` → `handle-pre.ts` → `respond()`), because `respond()` only distinguished `block` from everything else — a prior sniper pass had validated the 3-kind behavior against `toClaudeResponse` (used only by the separate `guard()`/CLI path), not the function actually on the hook path. `respond()` now honors all 3 `PromptKind`s for every harness.
- `security.ts`: deny/ask messages listed 4-7 possible causes in parentheses instead of naming which one actually matched — each `CRITICAL_PATTERNS`/`ASK_PATTERNS` entry now carries its own label (parity `security_rules.py`'s cumulated violation names).
- `interface-separation.ts`: the destination text for TS/JS/Vue/Svelte, PHP and Swift now matches the current `claude-rules/rules/04-solid-dry-rules.md` ("SOLID Skill per Stack" table) — `modules/[feature]/src/interfaces/`, `app/Contracts/`, `Sources/Interfaces/` — instead of the older `enforce-interfaces.py` wording; Go/Python/Java/Kotlin aren't covered by that table and keep a reasonable default.
- `bash-write.ts`: the 7 in-place-edit patterns and 2 ask-writer patterns were collapsed into 2 shared generic messages, never naming which motif (heredoc/sed/perl/awk/patch/tee/dd) matched — each now carries its own `desc`, split into `bash-write-patterns.ts` to stay under the SOLID file-size limit.
- SOLID file-size framework resolution (`evaluate.ts`) used the same `detectFramework()` as the unrelated `require-solid-read` gate (filename/content heuristics), diverging from `enforce-file-size.py::get_solid_ref()` (a same-directory `next.config.*` check) — misresolved nested Next.js App Router files and `.vue`/`.svelte` files. New `resolveSolidRefFramework()` matches the Python algorithm exactly.
- SOLID file-size scope (`evaluate.ts`) included `.css` via the broader `isCodeFile()`, contradicting the same decision already applied to `isApexScoped`; new `isFileSizeScoped()` excludes it, matching `enforce-file-size.py`'s `CODE_EXT`.
- SOLID file-size deny message on a `Write` showed the *incoming* (new) line count instead of the pre-existing on-disk count when both are over the limit — `enforce-file-size.py` always displays the pre-edit count.
- `solidReadGate` silently allowed when SOLID references were loaded but none scored for the edited file; `require-solid-read.py` still denies in that case, pointing at the framework's `SKILL.md`. Now blocks (the "no refs installed at all" case correctly stays allow, per `discoverRefs()`'s documented contract).
- `freshnessGate` always named both `explore-codebase` and `research-expert` as missing, even when only one actually was; now names the precise missing agent(s) via a new `ApexContext.missingAgents` field.
- `claude-md-context.ts::buildApexInstruction` templated the 3rd ANALYZE agent as `${projectType}-expert` (e.g. `generic-expert`, `laravel-expert` — neither is a real installed agent id). Replaced with `expert-agents.ts::getExpertAgent()`, which resolves the real `<plugin>:<agent>` id by scanning installed marketplace plugins (falls back to `general-purpose` when none match) — never a hardcoded table that can drift from what's actually installed.
- `lifecycle-bridge.ts::postEditContext`: `trackSessionChanges || postEditTypescript` always short-circuited on the first (unconditionally truthy for any `.ts`/`.tsx` edit), making the eslint/prettier check unreachable dead code; both now run and their `additionalContext` is merged.

### Changed

- Design pipeline (`SubagentStart`/`SubagentStop`/`agent_id`-gated `designLifecycle`) is now explicitly scoped to `detectHarness().id === "claude-code"` rather than relying on those fields being merely absent on other harnesses.

## [0.1.43] - 2026-07-01

### Fixed

- `harness doctor`/`--version` stderr version banner was printed on every CLI invocation, including `harness hook <scope>` — up to 9 separate hook processes per Edit/Write spammed the transcript. Now emitted only on explicit `--version`/`-v`/`doctor` commands.

## [0.1.42] - 2026-07-01

### Added

- `harness doctor`/`harness --version` command + stderr version banner + post-publish CI check to catch stale `bunx` installs (bug oven-sh/bun#5791).
- Differential Python↔TS test harness plus a golden-snapshot regression suite under `test/parity` (`FUSE_PARITY_PYTHON_ROOT` override).
- `FUSE_MCP_TTL_SEC`/`FUSE_WEBFETCH_TTL_SEC` env vars for the MCP/WebFetch cache TTLs.

### Changed

- Migrated ad-hoc `fs` writes to `atomicWrite`; moved the fuse-harness cache to a neutral `~/.fuse-harness/cache` (was nested under `~/.claude`).
- Extracted cross-module types into `interfaces/` (ISP) and split `handle.ts`/`gate.ts` under the 90-line SOLID limit.

## [0.1.41] - 2026-06-30

### Added

- Doc gate: `WebSearch`/`WebFetch`/fuse-browser now satisfy the doc-consulted gate; `activityFor` returns `Activity[]` so doc tools also credit `research-expert` (parity with the Python two-hook model).
- Auto-discovery of `solid-*/references` across Claude/Codex/Cursor (Open-Agent-Skills layout), deduped by skill name — the SOLID-read gate self-activates with no `FUSE_HARNESS_REFS`.
- `FUSE_HARNESS_MARKETPLACES` allowlist (default `fusengine-plugins`; an absent marketplace contributes nothing).

## [0.1.40] - 2026-06-30

### Fixed — parity with the Python `core-guards` plugin (phase 1)

- Security: `sudo`/`su`/`doas`/`passwd`/`del` now DENY (were ASK).
- `bash-write`: close `sed -E -i`, `node`/`ruby -e`, `dd of=` bypasses; exclude `2>`/`>&2`/`/dev/null`; add `.astro`/`.css`.
- File size counts physical lines (parity `sum(1 for _ in f)`).
- Doc gate: any ONE source satisfies (Context7 OR Exa OR WebSearch/WebFetch) — was AND.
- Credit direct exploration (Glob/Grep/Bash/MCP) + accept `Agent`/`Task` with plugin-prefix strip.
- APEX gates scoped to code files with exemptions; interface-separation PHP/dirs; refs flat scoring;
  protected-path targets the real write destination; MCP/WebFetch cache substring lookup + prompt-keyed
  WebFetch + 24h TTL + compaction/dedup/index; `TaskCompleted` SOLID hook; pre-commit lint runs before the
  git-ask short-circuit; creation-intent skip terms; revived sniper-reminder state readers.

### Fixed — parity with the other ported plugins (phase 2)

- SEO PostToolUse blocks via `decision: block` (was the ignored `permissionDecision` — a silent no-op).
- Sub-agents (explore/research/sniper) receive APEX + project-lessons injection again.
- Global lessons promotion (`_global/<stack>.json`) restored.
- Cartographer plugin-dir resolution is harness-agnostic + handles array-form `hooks.json`.

### Added

- Design UI-write gate (design skill + doc research; Gemini never required, stays opt-in).
- `ROADMAP.md`.

## [0.1.39] - 2026-06-29

### Fixed (protected-path guard test)

- **`test/hardening.test.ts`**: test "C" asserted a redirect into `~/.claude/fuse-harness/state/...` was blocked,
  which relied on the removed bare `/fuse-harness/` fragment. Repointed the assertion to a genuinely protected
  state path (`.harness/track`) so it validates the guard's intent, not the dropped fragment. (0.1.38 release
  job failed on this test; 0.1.38 was never published.)

## [0.1.38] - 2026-06-29

### Fixed (protected-path guard)

- **`policy/guards/protected-path.ts`**: dropped the `/fuse-harness/` fragment from `PROTECTED_FRAGMENTS`.
  It matched the harness dev repo's own absolute path, so the guard false-blocked every `Write`/`Edit`
  (and read-only `Bash`) inside the source tree. Deployed copies live under `node_modules`, not a
  `/fuse-harness/` path, so the fragment protected nothing real.

## [0.1.37] - 2026-06-28

### Added (native `.env` loading)

- **`config/dotenv.ts`**: the engine now loads `.env` itself at the start of `harness hook`, instead of
  relying on Bun auto-dotenv or `BASH_ENV`. Ports the claude-plugins `services/env-file.ts` reader
  (`export KEY="value"` / `KEY=value`, quotes + `#` comments, CRLF-safe) and merges into `process.env`
  **without overwriting** an already-set var (the real environment always wins). Per-harness home file
  (`~/.claude/.env`, `~/.codex/.env`, `~/.cursor/.env`, `~/.gemini/.env`, …) selected from the detected
  harness, plus the project `<cwd>/.env`. `loadDotenv` is wired into `cli/bin.ts` before `handleHook`, so
  every scope (memory's `NEURAL_MEMORY_HOST`/`GRAPHITI_PORT`, SOLID's `FUSE_*`, …) reads its vars natively.
- 5 new tests (`test/dotenv.test.ts`); 172 tests total.

## [0.1.36] - 2026-06-28

### Added (fuse-memory-neural port → `memory` scope)

- **New `memory` scope** (`PluginScope`, `cli/bin.ts` `validScopes`): ports the four memory-neural
  hook scripts into the engine, all best-effort against a Graphiti server
  (`NEURAL_MEMORY_HOST`/`GRAPHITI_PORT`, 5s `AbortSignal.timeout`, network/IO errors swallowed):
  - `auto-capture-error.py` → `memory/capture-error.ts`: a failed Bash command is stored as a
    Graphiti episode and a `qdrant-find`/`qdrant-store` hint is surfaced as additionalContext.
  - `track-memory-ops.py` → `memory/track-ops.ts`: graphiti/qdrant tool calls are logged to
    `~/.claude/logs/00-memory/operations.log` (rotate 1000→500).
  - `recall-on-session.py` → `memory/recall.ts`: SessionStart detects the project type and recalls
    relevant past lessons from Graphiti, injected as additionalContext.
  - `capture-agent-lesson.py` → `memory/agent-lesson.ts`: SubagentStop stores a finished agent's
    conclusion as an episode (skips explore-codebase/websearch + errored exits).
- The async scopes (`aipilot` + `memory`) are now dispatched through a shared
  `runtime/handle-scope-async.ts` helper, keeping `handle.ts` under the SOLID file-size limit.
- 9 new tests (`test/memory-scope.test.ts`): severity/salience scoring, project detection, log
  rotation, env-overridable base URL, best-effort no-op paths, dispatch routing. 167 tests total.

## [0.1.35] - 2026-06-27

### Added

- **`harness changelog` CLI verb**: ports the changelog-watcher plugin fetch into the engine —
  fetches the Claude Code changelog, parses recent versions, diffs against the saved per-day
  state (~/.claude/logs/00-changelog), and prints JSON {latest, new_since_last_check,
  recent_versions}. Dual-runtime (global fetch). The changelog-scan skill now calls the harness
  instead of a per-plugin script.

### Fixed

- Changelog parser updated to the current docs MDX format (Update label blocks) with the legacy
  header form kept as fallback — the old regex matched nothing on the live page.

## [0.1.34] - 2026-06-27

### Security (#8 — tamper-resistant enforcement state)

- **Freshness from the transcript**: the APEX explore+research gate now verifies prior
  agents from the runtime-authored session transcript (transcript_path), not the
  self-recorded track — so an agent can no longer forge its own state file to pass the
  gate (new src/freshness/agent-evidence).
- **State out-of-tree**: the session track moves from <repo>/.harness/track to
  ~/.claude/fuse-harness/state/<projectHash>/ (src/runtime/paths); the protected-path
  guard now also blocks Bash redirections into state dirs.
- **Integrity**: the track is persisted as an HMAC-signed envelope; load fails closed on
  MAC mismatch (src/tracking/integrity). The key is agent-readable, so the transcript
  evidence is the real guarantee; relocation + guard + HMAC are defense-in-depth.

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
