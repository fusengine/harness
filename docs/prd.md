# PRD — task/agent ownership coordination

**Opt-in, off by default.** When a lead splits one task across several
sub-agents, PRD gives every sub-agent a JSON file it — and only it — is
allowed to write, so two agents can never clobber each other's report. A
lead reads `harness prd status` to see who has finished what, and
`harness prd validate` promotes a task once every agent's report matches
what it was assigned. With the flag off, or with no router file on disk,
the module reads nothing, writes nothing, and every hook output is
byte-identical to a harness without PRD at all.

## Turn it on

Set `FUSE_PRD` to the exact string `1` in the harness's own `.env` —
`~/.claude/.env`, `~/.codex/.env`, `~/.cursor/.env`, `~/.kimi-code/.env` —
or in `<project>/.env`. Then a coordinator (the lead session) creates the
router file so the module has something to enforce.

| State | Router file | Result |
|---|---|---|
| `FUSE_PRD` unset | any | Inert. Zero reads, zero writes, unchanged stdout. |
| `FUSE_PRD=1` | missing | Still inert — activation needs **both** the flag and the router. Same output as the flag being unset. |
| `FUSE_PRD=1` | present | Active: ownership checks, the Bash-under-`prd/` deny, `SubagentStart` context, block-once on `SubagentStop`/`Stop`. |

## File layout

Everything lives under `<project>/<homeSeg>/apex/` (`homeSeg` is `.claude`,
`.codex`, `.cursor`, `.kimi-code` — whichever the running harness resolves
to). One writer per file, by construction:

| File | Written by |
|---|---|
| `apex/prd.json` (the router) | the coordinator only |
| `apex/prd/<task>-prd.json` | the coordinator only |
| `apex/prd/agents/<agent>-prd.json` | that one agent — nobody else |
| `apex/prd/docs/<task>.md` | the coordinator, free-form notes |

## Full cycle: the `auth-refactor` example

The fixtures behind this walkthrough are the exact files under
`test/fixtures/prd/` (`router.json`, `prd/auth-refactor-prd.json`,
`prd/agents/backend-expert-prd.json`). Every command output below was run
for real against those fixtures, copied into a throwaway project — not
invented.

1. The coordinator writes `.claude/apex/prd.json`:

   ```json
   { "auth-refactor": { "prd": "prd/auth-refactor-prd.json", "status": "assigned" } }
   ```

2. The coordinator writes `.claude/apex/prd/auth-refactor-prd.json`,
   naming two agents and what each owns:

   ```json
   {
     "backend-expert":   { "files": ["src/auth/login.ts"],   "sub-tasks": { "jwt-validation": { "status": "assigned" } } },
     "backend-expert-2": { "files": ["src/auth/session.ts"], "sub-tasks": { "session-store":  { "status": "assigned" } } }
   }
   ```

3. Both `backend-expert` and `backend-expert-2` report the same base
   `agent_type` (`backend-expert`), so a starting sub-agent's
   `SubagentStart` context can't yet tell which of the two it is. It gets
   **both** slices, prefixed with the exact disambiguation header from
   `agentSlices`/`renderAgentSliceMarkdown` (`prd-context.ts`):

   ```
   Several assignments match your agent type. You are ONE of: backend-expert, backend-expert-2. The first report you write binds your name; write only that report.

   ## PRD assignment — task auth-refactor
   Your files: src/auth/login.ts
   Your sub-tasks: jwt-validation
   Report to prd/agents/backend-expert-prd.json when done.

   ## PRD assignment — task auth-refactor
   Your files: src/auth/session.ts
   Your sub-tasks: session-store
   Report to prd/agents/backend-expert-2-prd.json when done.
   ```

   Whichever of the two writes its report **first** binds its `agent_id`
   to that name (`resolveOwnerBinding`, `prd-ownership.ts`) — the other
   sub-agent is then left with the one remaining candidate.

4. `backend-expert` finishes and writes **only**
   `.claude/apex/prd/agents/backend-expert-prd.json`:

   ```json
   { "auth-refactor": { "jwt-validation": { "status": "done", "modified": ["src/auth/login.ts"], "unchanged": [] } } }
   ```

5. `backend-expert` then tries to write `backend-expert-2-prd.json`
   instead — denied (exact reason string from `prd-ownership.ts`,
   prefixed with the offending path by `prd-pre-gate.ts`). The prefix is
   the file's **full canonical absolute path** (`canonicalFilePath()`),
   never a project-relative one — measured against a real project root
   below (yours will differ, but it is always absolute, never a bare
   `.claude/apex/...` fragment):

   ```
   [BLOCKED] PRD ownership
   <project>/.claude/apex/prd/agents/backend-expert-2-prd.json: name doesn't match your agent_type, or already bound to another agent
   Next: 1. Write only the files/report this agent owns per its PRD slice
         2. Run `harness prd status` to see the current assignment
   ```

6. The coordinator checks progress — no flag needed for `status`. This is
   the real output of `harness prd status --root <project>` at this point
   (`backend-expert-2` hasn't reported yet):

   ```
   $ harness prd status --root <project>
   Task           Router status  Agents  Sub-tasks done/total  Violations
   auth-refactor  assigned       2       1/2                   0
   ```

7. The coordinator tries to validate too early, **without** `FUSE_PRD=1` —
   denied because `validate` writes:

   ```
   $ harness prd validate auth-refactor --root <project>
   prd validate requires FUSE_PRD=1 in .claude/.env or the project .env
   ```
   (exit code `1`)

8. With the flag set, `validate` now catches the real gap —
   `backend-expert-2` still has no report:

   ```
   $ FUSE_PRD=1 harness prd validate auth-refactor --root <project>
   prd validate: 1 violation(s)
     - auth-refactor/backend-expert-2/session-store: no "done" report from "backend-expert-2" for sub-task "session-store"
   ```
   (exit code `1`)

9. Once `backend-expert-2` also writes its own
   `.claude/apex/prd/agents/backend-expert-2-prd.json` with a `"done"`
   entry for `session-store`, the same command succeeds silently:

   ```
   $ FUSE_PRD=1 harness prd validate auth-refactor --root <project>
   ```
   (exit code `0`, no output — both agents' sub-tasks are now `validated`
   and the router entry is promoted to `validated`)

10. `status` now confirms it:

    ```
    $ harness prd status --root <project>
    Task           Router status  Agents  Sub-tasks done/total  Violations
    auth-refactor  validated      2       2/2                   0
    ```

11. The coordinator compacts the finished task PRD (`compact` also
    requires the flag, since it writes):

    ```
    $ FUSE_PRD=1 harness prd compact auth-refactor --root <project>
    compacted: backend-expert, backend-expert-2
    ```
    (exit code `0`) — each agent entry in
    `.claude/apex/prd/auth-refactor-prd.json` is now
    `{ "status": "validated", "files": [...], "validated-at": "2026-09-02T21:04:10.223Z" }`.

    On Codex, this step is never a surprise: the coordinator's Stop right
    after step 10 already carried the compact hint below, naming
    `auth-refactor` and the exact command to run.

## What the guards do

Six enforcement points, all inert unless PRD is active — the last one is a
pure information, never a block:

| Guard | When | Who it applies to | What the agent sees |
|---|---|---|---|
| Write/Edit ownership (`prd-pre-gate.ts`) | A `Write`/`Edit`/`apply_patch` targets the router, a task PRD, or `prd/agents/*.json` | claude-code / codex: enforced by identity. cursor / kimi: consultative — never blocked here | A `[BLOCKED] PRD ownership` prompt: `<path>: <reason>`, where `<reason>` is one of `"router is coordinator-only"`, `"task PRD is coordinator-only"`, `"docs is coordinator-only"`, `"agent report is not the coordinator's to write"`, or `"name doesn't match your agent_type, or already bound to another agent"` |
| Bash-under-`prd/` deny (`prd-pre-gate.ts`) | A Bash `>`/`>>` redirect targeting `apex/prd/` (`shellOutputRedirects`), **or** one of 6 non-redirect write verbs whose write-target argument resolves there (`extraBashWriteTargets`, `prd-bash-targets.ts`): `cp`/`mv`/`install` (last positional arg), `tee` (every positional arg), `sed -i`/`perl -i` (last positional arg, in-place only), `dd of=` (the `of=` operand). Verified live: `cp <src> <prd-path>` and `dd if=<src> of=<prd-path>` both deny; `touch <prd-path>` — a write verb outside this list — is **not** caught here (falls through to the ordinary gate chain, which has no `.claude/apex/` case for `touch` either, so it currently allows). Best-effort static scanner, not a shell — see the module's own header for the `getopt_long` PERMUTE-mode edge case it does not track. | Everyone, coordinator included | `"PRD files must be written via Write/Edit/apply_patch, never Bash."` |
| PostToolUse cross-check (`prd-post-check.ts`) | Right after the router or a task PRD is written | Silent — no immediate message | Nothing at the time; a mismatch between what a task PRD assigned and what an agent actually reported is recorded, and can later trigger the lead's `Stop` block below |
| `SubagentStart` context (`prd-subagent-context.ts`) | A sub-agent's session starts | That sub-agent only | Its own file/sub-task slice injected as context (the `## PRD assignment` block in the example above) |
| `SubagentStop` block-once (`prd-subagent-stop.ts`) | A sub-agent tries to stop with an undone sub-task | That sub-agent, once | `"PRD sub-task(s) not done for <agent> on task \"<task>\": <sub1, sub2, ...>. Finish the work (or ask the coordinator to reassign) before stopping."` — never fires on Cursor (identity is unlinkable there, see Known limitations) |
| Lead `Stop` block-once (`prd-stop-gate.ts`) | The lead tries to stop with an unresolved cross-check violation | The gate itself is target-agnostic and verified correct on every id when invoked — but with **today's real marketplace wiring** it is only ever actually invoked on Codex. claude-code's and Kimi's own Stop hook always carries `--sound stop`, which exits in `maybePlaySound()` (`src/cli/hook-sound.ts`) before the harness reads its payload at all — the gate never runs there, block or no block. Never fires on Cursor either (`stop` isn't gated there — design doc §5). See Known limitations for the full measurement. | `"PRD cross-check found unresolved violation(s): a task/sub-task is marked validated without a matching done report. Run \`harness prd status\` for details."` |
| Lead `Stop` compact hint (`prd-stop-gate.ts`) | The lead's Stop fires with **no** violation and at least one task is fully validated (every agent, every sub-task) but not yet compacted | Target-agnostic in code — it mirrors the SAME per-target form choice as the block-once row above, with no id allowlist. In practice it is reached by the SAME targets as the block-once gate above, for the SAME wiring reasons: today, that means Codex only. See Known limitations. | `hookSpecificOutput.additionalContext`: `"PRD task \"<task>\" is fully validated and ready to compact. Run \`harness prd compact <task>\`."` (or, with several tasks ready at once, `"PRD tasks fully validated and ready to compact: <t1>, <t2>. Run \`harness prd compact <task>\` for each."`) |

A malformed (unparseable JSON) router with `FUSE_PRD=1` active is its own
case: every in-scope PRD write is denied with
`"PRD router is malformed JSON — fix apex/prd.json or unset FUSE_PRD."`,
while every other file in the same session is unaffected.

One edge case worth calling out: an `agent_id` with **no** `agent_type` at
all (not observed live, but a defined case) is always treated as a
sub-agent and denied outright on an agent-report write — reason
`"unidentifiable agent_type — cannot verify ownership"` — rather than
falling back to consultative mode. Presence of `agent_id` proves the
harness *can* send identity, so a missing `agent_type` is failed closed,
unlike Cursor/Kimi's structural absence of both fields.

## Capability matrix

Per capability, not per adapter — coverage splits unevenly across targets:

| Capability | claude-code | codex | cursor | kimi | cline / gemini-cli / hermes |
|---|---|---|---|---|---|
| Write ownership block | full | full | consultative only (never blocks) | consultative only (never blocks) | full, if the consumer wires `PreToolUse` |
| Bash-under-`prd/` deny | yes | yes | yes | yes | yes |
| `SubagentStart` slice injection | yes | yes | **no** — the slice IS built (identical to claude-code's), but `adapters/cursor/respond.ts`'s `toCursorLifecycleResponse` collapses any non-denied `subagentStart` to bare `{"permission":"allow"}`, dropping it; measured byte-identical output with a matching PRD assignment, with no router at all, and with `FUSE_PRD` unset | delivered, ignored (observation-only) | gemini-cli: yes, delivered — routed through `respond()`'s native "inform" shape, then re-wrapped by `joinContextResponses` into the shared Claude-style `hookSpecificOutput.hookEventName/additionalContext` envelope plus a `[NOTE]` title line (not gemini-cli's own minimal shape, but the text arrives). hermes: yes, delivered — same Claude-style `contextResponse` as claude-code; Hermes's own documented non-blocking shape is `{context}`, not `hookSpecificOutput`, so whether a real Hermes client reads it is unverified. cline: yes, delivered in its own native `{contextModification}` shape — `joinContextResponses` keeps whichever envelope its parts came from instead of assuming the Claude one (measured 476 bytes where an earlier build emitted none; the six other targets stay byte-identical, gemini-cli 529 = 529, the Claude-family four 506 = 506) |
| `SubagentStop` block-once | yes | yes | delivered, response ignored | delivered, response ignored | yes — each in its OWN native block shape via `respond()`: gemini-cli `{"decision":"deny","reason"}`, cline `{"cancel":true,"errorMessage"}`, hermes `{"decision":"block","reason"}` (via `blockResponse`, which happens to match Hermes's own documented block contract). Block-once verified: 1st call blocks, an identical replay is silent (empty stdout) on all three, under both the default journal-based session track and legacy `FUSE_TRACK_JOURNAL=0` |
| Lead `Stop` block-once | **no** — the gate itself is correct and fires when invoked (verified byte-for-byte), but claude-code's real marketplace Stop hook always calls the harness with `--sound stop`, which exits in `maybePlaySound()` before stdin is read — the gate is never reached | yes | not applicable (`stop` isn't gated on Cursor today) | **no** — same root cause as claude-code: Kimi's own marketplace Stop hook also always carries `--sound stop` | yes — same per-adapter native shapes and block-once behavior as `SubagentStop` above (gemini-cli/cline/hermes), verified under both tracking modes |

Cursor and Kimi never hard-block on file ownership: the harness cannot
correlate a sub-agent's write back to its own identity on either target
(see [Known limitations](#known-limitations)), so both stay consultative
and rely on the after-the-fact cross-check instead.

## CLI

```
harness prd status [--json] [--id <id>] [--root <path>]
harness prd validate <task> [agent] [--id <id>] [--root <path>]
harness prd compact <task> [--id <id>] [--root <path>]
```

`--root` defaults to `cwd`. `--id` picks the harness (and therefore the
`homeSeg` — `.claude`, `.codex`, …) explicitly; without it, the CLI
auto-detects the *sole* `homeSeg` under `--root` that has an
`apex/prd.json` — zero or more than one match is a usage error, not a guess.

- **`status`** — read-only, works **without** `FUSE_PRD=1`.
- **`validate`** — writes, so it **requires `FUSE_PRD=1`**. Runs the
  cross-check; on success, flips the given agent's (or every named
  agent's) sub-tasks to `validated` and promotes the router entry once
  every agent is validated.
- **`compact`** — writes, so it **requires `FUSE_PRD=1`**. Collapses a
  fully-validated task PRD to its compacted shape; refuses if any
  sub-task isn't `validated` yet.

Exit codes and the exact messages, as measured:

| Case | Command | Exit | stderr |
|---|---|---|---|
| No router anywhere under `--root`, no `--id` | `status` | `2` | `no PRD router found under <root>/<home>/apex/prd.json — pass --id <harness>` |
| `--id` given but that harness has no router | `status` | `1` | `no PRD router at <root>/<homeSeg>/apex/prd.json` |
| `validate`/`compact` without `FUSE_PRD=1` | either | `1` | `` prd <sub> requires FUSE_PRD=1 in <homeSeg>/.env or the project .env `` |
| `validate` finds unready sub-tasks | `validate` | `1` | `prd validate: N violation(s)` + one `  - <task>/<agent>/<sub>: <reason>` line per violation |
| `compact` before every sub-task is `validated` | `compact` | `1` | `prd compact: sub-task "<sub>" of agent "<agent>" is not validated` |
| Usage error (missing `<task>`, unknown task/agent) | `validate`/`compact` | `2` | e.g. `no such task "<task>" in PRD router`, `no such agent "<agent>" in task PRD for "<task>"` |
| Success | any | `0` | (empty for `validate`; `compacted: <agents>` or `nothing to compact` for `compact`) |

Real `status` output against the `auth-refactor` fixture (`backend-expert`
already reported, `backend-expert-2` hasn't yet):

```
$ harness prd status --root <project>
Task           Router status  Agents  Sub-tasks done/total  Violations
auth-refactor  assigned       2       1/2                   0
```

Real `--json` output (same state):

```json
{
  "router": { "auth-refactor": { "prd": "prd/auth-refactor-prd.json", "status": "assigned" } },
  "taskFiles": {
    "auth-refactor": {
      "backend-expert":   { "files": ["src/auth/login.ts"],   "sub-tasks": { "jwt-validation": { "status": "assigned" } } },
      "backend-expert-2": { "files": ["src/auth/session.ts"], "sub-tasks": { "session-store":  { "status": "assigned" } } }
    }
  },
  "reports": {
    "backend-expert": { "auth-refactor": { "jwt-validation": { "status": "done", "modified": ["src/auth/login.ts"], "unchanged": [] } } },
    "backend-expert-2": null
  }
}
```

## FAQ

**My sub-agent's write got refused — why?**
Its `agent_type` doesn't match a name in the task PRD, or that name is
already bound to a different `agent_id`. Run `harness prd status` and
check the task PRD names your agent exactly (`<agentType>` or
`<agentType>-<n>`, n ≥ 2).

**Why do I see two assignments in my context?**
Your `agent_type` matches more than one name in the task PRD (e.g.
`backend-expert` matches both `backend-expert` and `backend-expert-2`).
The context shows every matching slice with the disambiguation header
above so nothing is silently dropped. Nothing to fix — just write your
**one** report first: the first `prd/agents/<name>-prd.json` write from
your `agent_id` binds that name to you, and every later write must match
the bound name.

**Nothing happens at all — why?**
Check, in order: is `FUSE_PRD` set to exactly `"1"`? Does
`<homeSeg>/apex/prd.json` exist? Is the harness one that sends agent
identity at all — Cursor and Kimi never do, so ownership stays
consultative there by design, not by bug.

**How do I turn it off?**
Unset `FUSE_PRD` (or set it to anything other than `"1"`), or delete the
router file — either one alone returns the module to fully inert.

## Known limitations

- **Cursor's `SubagentStart` slice is built, then dropped.** The
  injection runs the identical code path claude-code uses (confirmed by
  running the same router/task-PRD state through both target ids), but
  Cursor's own response contract has no context channel for a
  non-denied `subagentStart`: `toCursorLifecycleResponse` always
  collapses it to bare `{"permission":"allow"}`. Verified live: the
  output is byte-identical whether the router has a matching assignment,
  no router at all, or `FUSE_PRD` is unset entirely — a Cursor sub-agent
  never sees its PRD slice.
  (cline had the same symptom for a different, fixable reason:
  `joinContextResponses` recognized only the Claude-shaped
  `hookSpecificOutput.additionalContext` envelope and silently dropped
  cline's native `{contextModification}` inform shape. That one is now
  fixed — the merge keeps whichever envelope its parts came from, so
  cline receives 476 bytes where it previously received none, and all
  six other targets stay byte-identical. Cursor's gap below is
  structural and remains.)
- **Cursor can't correlate a sub-agent's write to its own identity.** A
  Cursor sub-agent's actual file-write event runs under a session ID
  that shares nothing with the lead's or with the `SubagentStart`
  event's own IDs. Per-write ownership checking on Cursor isn't possible
  today — only the after-the-fact cross-check catches a mismatch.
- **Neither Cursor nor Kimi ever sends an agent identity field at all**
  on a Write/Edit payload, so the harness can't tell who the lead even
  is there. Both targets default to consultative mode permanently,
  rather than guessing at a correlation.
- **No file lock on PRD writes.** The ownership guard makes two agents
  writing the *same* file at once structurally impossible, but a write
  from completely outside the guarded hook path (a human editing the
  file directly in a terminal) isn't something any guard here can see.
- **Kimi's `SubagentStop` block-once is best-effort.** Kimi delivers the
  `SubagentStop` event but ignores its response by protocol, so the
  block never actually stops anything there. The lead `Stop` gate is a
  DIFFERENT problem on Kimi — see the wiring bullet below, it never even
  runs.
- **Block-once persistence is tracking-mode-independent, verified.** Both
  `SubagentStop` and lead `Stop` block-once markers are written on
  whichever side `trackJournalEnabled()` reads from — the default
  journal-based session track, or the legacy full-snapshot one under
  `FUSE_TRACK_JOURNAL=0` — so a replay is silent (empty stdout) after the
  first block in both modes. Verified live in both modes; this used to
  only hold under the (default) journal mode.
- **The lead `Stop` gate (block AND compact hint) never runs on
  claude-code or Kimi today — a wiring gap, not a harness bug.** Both
  `prd-stop-gate.ts` functions are target-agnostic in code: no id
  allowlist, same per-target form choice throughout (verified correct on
  every id when invoked directly — see the B5/B6 test suites). The gap is
  entirely on the OTHER side of the boundary: checked against the real
  `hooks.json`/`kimi.plugin.json` this project ships for each target
  (`claude-plugins`/`codex-plugins`/`kimi-code-plugins`), claude-code's and
  Kimi's own marketplace Stop hook always calls the harness with
  `--sound stop`, and `maybePlaySound()` (`src/cli/hook-sound.ts`) plays
  the sound and exits **before stdin is even read** — the harness never
  sees the Stop payload at all, so neither function can run, block or
  hint alike. This is a marketplace wiring defect (the fix is dropping
  `--sound stop` from that one `Stop` hook entry, or adding a second,
  flag-less `hook <id> core` entry alongside it), not something
  `prd-stop-gate.ts` itself can compensate for. Codex's own Stop wiring
  has no such flag, so it is the only target where this gate is reachable
  today. Hermes (26 `VALID_HOOKS`, per its own plugin docs) and Gemini CLI
  (11 lifecycle events, per its own hook reference) have no event literally
  named `Stop` at all; their closest analogs (`on_session_end`,
  `SessionEnd`) either ignore the hook's return value or are documented
  "Best Effort" with all flow-control fields ignored. Cline's own init
  template this harness ships (`clineInit`) wires only
  `PreToolUse`/`PostToolUse`. Should any of these five targets grow a
  genuinely reachable non-blocking Stop channel, nothing in
  `prd-stop-gate.ts` needs to change — it already mirrors the block path's
  per-target form for every id; only the external wiring would need to
  change.
