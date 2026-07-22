# detect — runtime harness detection

`import { detectHarness, detectMode, modeFor } from "@fusengine/harness/detect";`

Identifies which AI coding harness the process runs in, and its integration
capability. Detection is **presence-based** on environment variables (the value
is ignored, except for the `AGENT` / `AI_AGENT` standards).

## API

### `detectHarness(env?): HarnessInfo`
Returns `{ id, mode, via }`. Priority order:
1. `AGENT=<name>` standard (Goose, Amp, …)
2. `AI_AGENT=<name>` standard (Vercel)
3. tool-specific env var
4. `unknown` (mode `cli`)

`env` defaults to `process.env`; pass a map to test.

### `detectMode(env?): "hook" | "cli"`
Shortcut for `detectHarness(env).mode`.

### `modeFor(id): "hook" | "cli"`
`hook` for harnesses with a native hook system, else `cli`.

## Detection table

| Harness | Signal (env) | Mode |
|---------|--------------|------|
| Claude Code | `CLAUDECODE` | hook |
| OpenAI Codex | `CODEX_SANDBOX` | hook |
| Cursor | `CURSOR_AGENT` | hook |
| Cline | `CLINE` / `CLINE_AGENT` | hook |
| Gemini CLI | `GEMINI_CLI` | hook |
| opencode | `OPENCODE` | hook |
| Hermes | `HERMES_SESSION_ID` | hook |
| Kimi Code | no dedicated env var — `AGENT=kimi` / `AI_AGENT=kimi` only (verified live against kimi-code v0.27.0: a `config.toml` hook process gets no session marker, and neither `KIMI_CODE_HOME` nor `KIMI_PLUGIN_ROOT` — those reach plugin-declared hooks only) | hook |
| Windsurf | `WINDSURF_AGENT` / `CODEIUM_AGENT` | cli |
| Copilot | `COPILOT_AGENT` | cli |
| Aider | `AIDER` | cli |
| Kiro | `KIRO` | cli |
| Goose | `GOOSE` / `AGENT=goose` | cli |
| Amp | `AMP` / `AGENT=amp` | cli |

> Sources verified 2026: official Claude Code / Cursor / Gemini / Codex docs,
> `agents.md#136`, `sageox/agentx`, `@vercel/detect-agent`.

## Example

```ts
const { id, mode } = detectHarness();
if (mode === "hook") registerHook();   // Claude/Cursor/Cline/Gemini/opencode
else runViaPreCommit();                // Aider/Windsurf/OpenHands/…
```
