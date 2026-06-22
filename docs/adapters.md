# adapters — wiring the core into a harness

The core (`policy`, `cache`, …) is harness-agnostic. An **adapter** is the thin
shim that (1) parses a harness's event payload, (2) calls the core, (3)
serializes that harness's native response. Adapters are the *only*
harness-specific code.

## Claude Code — `@fusengine/harness/adapters/claude`

| Export | Description |
|--------|-------------|
| `readClaudeInput()` | parse the Claude hook stdin payload |
| `denyResponse(event, reason)` | `hookSpecificOutput` deny JSON |
| `contextResponse(event, text)` | `additionalContext` injection JSON |
| `fileSizeGuard(input)` | PoC: deny an oversized code Write, else null |

```ts
import { readClaudeInput, fileSizeGuard } from "@fusengine/harness/adapters/claude";

const deny = fileSizeGuard(await readClaudeInput());
if (deny) { console.log(deny); process.exit(2); }   // exit(2) = block in Claude Code
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

| Adapter | State |
|---------|-------|
| Claude Code (hook) | ✅ implemented |
| Cursor / Cline / Gemini (hook) | ⏳ planned |
| CLI binary (cli-mode) | ⏳ planned |
