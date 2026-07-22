# adapters — wiring the core into a harness

The core (`policy`, `cache`, …) is harness-agnostic. An **adapter** is the thin
shim that (1) parses a harness's event payload, (2) calls the core, (3)
serializes that harness's native response. Adapters are the *only*
harness-specific code.

> **Thin (stateless) vs full (stateful).** An adapter's `guard()` runs only the
> **stateless** policy (`evaluate`: file-size, git, security, bash-write,
> install, interface, protected-path) — it judges the *command*, not the
> *session*. The **full** enforcement (stateless **+** the stateful APEX gates:
> freshness, doc-consulted, SOLID-read, brainstorm + activity recording) only
> runs through **`handleHook`** (i.e. `harness hook <id>`), which reads/writes
> the session track. Use `handleHook` for real enforcement; the thin adapter
> exports are a fast stateless building block, not the complete gate.

## Compatibility matrix

**No harness enforces the full policy the same way.** This is the ceiling per
adapter, not a formatting difference — read the "Known limit" column before
assuming a gate that works on Claude Code also works elsewhere.

| Harness | Adapter file | PreToolUse coverage | Lifecycle events | Known limit |
|---|---|---|---|---|
| **claude-code** | `adapters/claude/index.ts` | Full: `evaluate` + APEX gates via `handleHook` | 14 event types implemented in `runtime/lifecycle/dispatch.ts` (SessionStart, SessionEnd, SubagentStart/Stop, Stop, PreCompact, PostCompact, TaskCompleted, TeammateIdle, PostToolUseFailure, InstructionsLoaded, UserPromptSubmit, plus Pre/PostToolUse) | Only PreToolUse+PostToolUse are wired by `harness init` (`init/templates.ts:18-27`); the other 12 event types require the consumer's own `.claude/settings.json` to route them. |
| **codex** | `adapters/codex/index.ts` + `adapters/codex/apply-patch.ts` | `Bash \| apply_patch` matcher, PostToolUse (`init/templates.ts:29-38`). **`apply_patch` edits are gated**: the patch text is parsed per file, each hunk runs the file gates (protected-path, file-size, DRY) and one violating hunk denies the whole patch (`runtime/apply-patch-gate.ts`, sim scenarios 22-23). `ask` is downgraded to an explicit deny (`respond.ts`) — Codex fails open on unsupported shapes. | none wired | Upstream: Codex does not always enforce a correct `apply_patch` deny (openai/codex#27833) — the harness emits the right verdict, enforcement is Codex's. Do not add a Codex `PermissionRequest` path until `respond()` emits Codex's own wire shape (`codex/index.ts`). |
| **cursor** | `adapters/cursor/index.ts` | `beforeShellExecution` can deny/ask (shell only, lines 16-21) | none | File edits are **advisory only**: `afterFileEdit` always returns `allow` + a `user_message` correction on violation — a `deny` there has no proven effect (hook launched "informational only"; Cursor's deny-enforcement for file ops is confirmed broken upstream, forum.cursor.com/t/154377). The human sees the message; the model is never re-informed. Platform ceiling, sourced in the adapter JSDoc. |
| **gemini-cli** | `adapters/gemini/index.ts` | `BeforeTool` denies via `{decision:"deny",reason}` (lines 22-36) | none | Thin stateless adapter — no session track, no APEX gates reachable through it. |
| **cline** | `adapters/cline/index.ts` | `PreToolUse` only; block → `{cancel:true}`, non-block → `contextModification` (lines 24-36) | none | Same as gemini-cli: stateless guard only, `PreToolUse` cannot modify tool parameters (per docs.cline.bot). |
| **hermes** | `adapters/hermes/index.ts` | `pre_tool_call` proven: reuses the Claude stdin reader, blocks via `{decision:"block",reason}` (lines 12-36) | untested — no lifecycle dispatch wired for Hermes in this repo | `ask`/`inform` degrade to non-blocking `{context}` — Hermes "has no interactive ask state" (lines 27-28). |
| **kimi** | `adapters/kimi/index.ts` | `PreToolUse` denies via the camelCase JSON channel `{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"…"}}` on stdout at **exit 0** (verified live against kimi-code v0.27.0 — exit 2 with stderr = reason also blocks, but is not required) — only `deny` is documented. `ask` is **downgraded to deny** prefixed `[downgraded from ask — Kimi Code has no interactive approval]`; `inform` rides plain stdout text at exit 0, never wrapped in JSON. Blocking events: `UserPromptSubmit`, `PreToolUse`, `Stop`. | Observation only: `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionResult`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `StopFailure`, `Interrupt`, `PreCompact`, `PostCompact`, `Notification` — Kimi delivers them but **ignores any response**, so no verdict can be returned from them. | A **hook** cannot request approval — Kimi's `ask` lives in a parallel, hook-unreachable system (`[[permission.rules]] decision = "ask"` in `config.toml`), hence the ask→deny downgrade. Hooks are configured **only** in the global `~/.kimi-code/config.toml` (no project-local hooks file), so `harness init` writes no kimi wiring — see [Kimi Code — manual wiring](#kimi-code--manual-wiring). **Fail-open by design**: any exit code other than 0/2, a timeout, or a crash lets the call through. Stdin payload is snake_case and carries only `hook_event_name`, `session_id`, `cwd`, `tool_name`, `tool_input.command` and an undocumented `tool_call_id` (unused here) — no `transcript_path`, no `permission_mode`, no `tool_response`. Verified live against kimi-code v0.27.0 for `PreToolUse`/`Bash`. Instructions file is `AGENTS.md`, not `CLAUDE.md`. |

## Claude Code — `@fusengine/harness/adapters/claude`

| Export | Description |
|--------|-------------|
| `readClaudeInput()` | parse the Claude hook stdin payload |
| `denyResponse(event, reason)` | `hookSpecificOutput` deny JSON |
| `contextResponse(event, text)` | `additionalContext` injection JSON |
| `systemMessage(text)` / `informResponse(event, notice, context)` | user-visible pass notices (`systemMessage` channel), independent of the blocking decision |
| `guard(input)` | stateless-only: runs `evaluate()` and returns the native response, or null to allow |

```ts
import { readClaudeInput, guard } from "@fusengine/harness/adapters/claude";

const out = guard(await readClaudeInput());
if (out) { console.log(out); process.exit(0); }   // stdout carries the hookSpecificOutput deny/ask
```

## Kimi Code — manual wiring

`harness init` writes **no** kimi config: Moonshot AI's Kimi Code CLI reads
hooks only from the global `~/.kimi-code/config.toml`, which sits outside
`init`'s project-local model. Wire it by hand — append to `~/.kimi-code/config.toml`:

```toml
[[hooks]]
event = "PreToolUse"
matcher = "Bash"
command = "npx -y @fusengine/harness hook kimi"
timeout = 30

[[hooks]]
event = "UserPromptSubmit"
command = "npx -y @fusengine/harness hook kimi"
timeout = 30
```

> **Emit only these four fields.** A `[[hooks]]` entry accepts exactly `event`
> (required), `matcher` (regex, optional), `command` (required) and `timeout`
> (int, 1-600s, default 30). **Any extra field makes Kimi fail to load the whole
> config** — do not add `id`, `name`, `type`, `enabled`, or anything else.

Notes:

- Tool names differ from Claude Code: `FetchURL` (not `WebFetch`), `Agent` (not
  `Task`), plus `Read/Write/Edit/Grep/Glob/ReadMediaFile/Bash/WebSearch/EnterPlanMode/ExitPlanMode/TodoList/AgentSwarm/AskUserQuestion/Skill/TaskList/TaskOutput/TaskStop/CronCreate/CronList/CronDelete`
  and `mcp__<server>__<tool>`. Write `matcher` regexes against those names.
- `Write`/`Edit` field names differ from Claude Code too: `Write` takes `path`
  + `content` (verified live against kimi-code v0.27.0, see below); `Edit`
  takes `path` + `old_string`/`new_string` (per `docs/en/reference/tools.md`,
  moonshotai/kimi-code — not yet live-tested). The path key is always `path`,
  never Claude's `file_path` (`src/adapters/kimi/index.ts`, `interfaces/types.ts`).
- The plan tool is `TodoList` (single tool, full-list re-emit per call) with a
  `pending | in_progress | done` status enum — never Claude's
  `TaskCreate`/`TaskUpdate`/`TaskList` triad (`src/policy/apex-target.ts`,
  `src/policy/apex-target-steps.ts`).
- Exit 0 = continue; exit 2 = stop, stderr is the reason; **anything else —
  other exit codes, timeout, crash — allows the call** (fail-open by design).
  The docs say stdout at exit 0 "may be appended" to the model's context —
  hedged, and `unverified — needs live test` (only deny and allow were
  exercised live), so treat `inform` delivery as best-effort.
- Only plugin manifests may declare hooks besides this file; there is no
  project-local hooks file.
- The dispatcher routes by payload, so every entry uses the same
  `hook kimi` command; the event comes from `hook_event_name` on stdin.
- **End-to-end wiring verified live against kimi-code v0.27.0** (`PreToolUse` /
  `Bash`): the deny envelope on stdout with **exit 0** stops the command — exit
  2 is not required — and Kimi re-injects `permissionDecisionReason` to the
  model, which cites it instead of retrying. Empty stdout at exit 0 lets the
  command run. The stdin payload carried `hook_event_name`, `session_id`,
  `cwd`, `tool_name`, `tool_input.command`, plus an **undocumented
  `tool_call_id`** the harness does not consume. A second, unrelated
  `PreToolUse` hook coexisted in the same config without error (the ordering
  and combination rule between two hooks on one event was not isolated).
  Events other than `PreToolUse`, and the `Edit` `tool_input` field names,
  remain `unverified — needs live test` — `Write`'s (`path`/`content`) has
  since been verified live (`src/adapters/kimi/index.ts:10-11`).
- After editing `~/.kimi-code/config.toml` by hand, run **`kimi doctor`** — the
  official validator; it prints `OK config.toml <path>` / `All checked config
  files are valid.` and exits non-zero on an invalid or missing file. Cheapest
  way to catch the extra-field trap above.

## Adding a harness

Two modes — pick by `detectMode()`:

### hook-mode (Cursor, Cline, Gemini, opencode)
Write `src/adapters/<harness>/index.ts`:

```ts
import { evaluate } from "../../policy/evaluate";

export function onBeforeEdit(payload: CursorPayload): CursorResponse {
  const r = evaluate({
    tool: "Write",
    filePath: payload.path,
    content: payload.newText,
  });
  return r.decision === "deny"
    ? { block: true, reason: r.message ?? "" }   // ← harness-native shape
    : { block: false };
}
```

Add a subpath in `package.json` `exports` and a `test/<harness>.test.ts`.

### cli-mode (Aider, Windsurf, OpenHands — no hook system)
These have no lifecycle hooks. Run the core from an external step (pre-commit,
lint, CI) via a CLI entry that reads staged files and calls `evaluate()`,
exiting non-zero on `deny`. *(The `bin/` CLI is not yet implemented — see the
roadmap in [CHANGELOG](../CHANGELOG.md).)*

## Status

## Wiring it in — `harness init` / `harness hook`

```sh
npx harness init          # detects the harness, writes its wiring file
npx harness init codex    # or target one explicitly
```

`init` writes the right config (`.claude/settings.json`, `.codex/hooks.json`,
`.cursor/hooks.json`, `.gemini/settings.json`, or `.clinerules/hooks/PreToolUse`)
pointing at `npx harness hook <id>` — the runtime dispatcher that reads the hook
payload on stdin, routes it to the adapter, and prints the native response.

## Status

| Adapter | Subpath | State |
|---------|---------|-------|
| Claude Code (hook) | `@fusengine/harness/adapters/claude` | ✅ |
| OpenAI Codex (hook) | `@fusengine/harness/adapters/codex` | ✅ (reuses Claude) |
| Cursor (hook) | `@fusengine/harness/adapters/cursor` | ✅ |
| Cline (hook) | `@fusengine/harness/adapters/cline` | ✅ |
| Gemini CLI (hook) | `@fusengine/harness/adapters/gemini` | ✅ |
| Hermes (hook) | `@fusengine/harness/adapters/hermes` | ✅ (reuses Claude stdin reader) |
| Kimi Code (hook) | `@fusengine/harness/adapters/kimi` | ✅ adapter — manual wiring only (no `harness init` runner) |
| CLI (`harness-check`) | `@fusengine/harness/cli` + bin | ✅ |

### cli-mode usage (Aider / Windsurf / OpenHands)

Install the package, then run `harness-check` as a pre-commit step:

```sh
# .husky/pre-commit  (or .git/hooks/pre-commit)
npx harness-check
```

It reads staged files, runs `evaluate()` on each, and exits non-zero (blocking the
commit) with the formatted prompt when a policy denies.
