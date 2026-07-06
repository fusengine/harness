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
| **codex** | `adapters/codex/index.ts` (re-exports the Claude reader/response — Codex's `PreToolUse` wire shape matches Claude's, `codex/index.ts:1-8`) | `Bash \| apply_patch` matcher, PostToolUse (`init/templates.ts:29-38`) | none wired | The SOLID/file-size gate covers `apply_patch` at **0%** — it keys off `tool_input.file_path` (Write/Edit shape), which Codex's diff-carrying `apply_patch` never supplies (`codex/index.ts:6-8`). Codex also parses but does **not** honor `permissionDecision:"ask"` (deny-only, `codex/index.ts:6`). Do not add a Codex `PermissionRequest` path until `respond()` emits Codex's own wire shape (`codex/index.ts:10-13`). |
| **cursor** | `adapters/cursor/index.ts` | `beforeShellExecution` can deny/ask (shell only, lines 16-21) | none | `afterFileEdit` is **observe-only** — "Cursor cannot block here" (lines 23-24); a file-edit violation is returned as `{violation}` for logging, never prevented. Platform limit, not a gap in this adapter. |
| **gemini-cli** | `adapters/gemini/index.ts` | `BeforeTool` denies via `{decision:"deny",reason}` (lines 22-36) | none | Thin stateless adapter — no session track, no APEX gates reachable through it. |
| **cline** | `adapters/cline/index.ts` | `PreToolUse` only; block → `{cancel:true}`, non-block → `contextModification` (lines 24-36) | none | Same as gemini-cli: stateless guard only, `PreToolUse` cannot modify tool parameters (per docs.cline.bot). |
| **hermes** | `adapters/hermes/index.ts` | `pre_tool_call` proven: reuses the Claude stdin reader, blocks via `{decision:"block",reason}` (lines 12-36) | untested — no lifecycle dispatch wired for Hermes in this repo | `ask`/`inform` degrade to non-blocking `{context}` — Hermes "has no interactive ask state" (lines 27-28). |

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
| CLI (`harness-check`) | `@fusengine/harness/cli` + bin | ✅ |

### cli-mode usage (Aider / Windsurf / OpenHands)

Install the package, then run `harness-check` as a pre-commit step:

```sh
# .husky/pre-commit  (or .git/hooks/pre-commit)
npx harness-check
```

It reads staged files, runs `evaluate()` on each, and exits non-zero (blocking the
commit) with the formatted prompt when a policy denies.
