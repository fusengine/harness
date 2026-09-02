# Cursor hook fixtures

Fixtures for `test/cursor-authentic-fixtures.test.ts` and `test/cursor-native-bytes.test.ts`,
one directory per Cursor hook event name. Each fixture is a JSON file with two top-level
keys: `provenance` (where the payload came from) and `stdin` (the exact bytes fed to the
harness's Cursor adapter).

## Two kinds of fixture

### 1. Authentic captures (8 files, 3 events)

Real Cursor stdin payloads, captured from `~/Library/Application Support/Cursor/logs/cursor.hooks*.log`
on Cursor 3.17.8 / 3.18.9 (2026-08-23 to 2026-09-01), via a probe hook that logged its own stdin
and wrote no output. Copied **as-is** (byte-identical `stdin`) from the sanitized corpus at
`scratchpad/cursor-captures/fixtures/` — see that directory's `field-matrix.md`, `diagnostics.md`,
and `gaps.md` for the full analysis this fixture set is drawn from.

| Directory | Files | Cursor version |
|---|---|---|
| `sessionStart/` | 1 | 3.17.8 (empty window, Claude-compat `claude-user config`) |
| `beforeSubmitPrompt/` | 1 | 3.18.9 |
| `preToolUse/` | 6 (`01`–`06`) | 3.18.9 (tools: Task, Shell, Write, Grep, Read) |

**Sanitization method (v1)**, applied to the raw logs before any fixture was written:
- Real home directories → `/Users/user`
- Real project paths → `/Users/user/project`
- Real UUIDs (conversation/generation/session/tool-call ids) → deterministic fake UUIDs,
  internally consistent (the same real UUID always maps to the same fake one within a
  capture, preserving e.g. `conversation_id === session_id`)
- Real email → `user@example.com`
- Free-text tool inputs (prompts, file contents) → `<redacted …, N chars>` placeholders that
  preserve the original length
- Everything else (field names, types, presence/absence, numeric values, key order) is
  UNCHANGED from the real capture

### 2. Binary-verified synthetic shapes (14 files, `preToolUse/07` + 14 event directories)

For every mandate event with **no authentic capture available** (see "no capture" list
below), the fixture's `stdin` shape is NOT a live capture. It was constructed field-by-field
from Cursor 3.18.25's own validators (`agent-cli 190.index.js` / `workbench.desktop.main.js`,
functions `R`/`Ded`), cross-checked against the published Cursor hooks documentation. Every
such fixture carries:

```json
"provenance": { "source": "binary-verified shape (Cursor 3.18.25, agent-cli 190.index.js / workbench.desktop.main.js) — NOT a live capture" }
```

`preToolUse/07-multi-root-synthetic.json` is additionally synthetic within an otherwise
authentic-backed event: `workspace_roots` with 2 entries was never observed in the corpus
(`gaps.md`: "multi-root NOT observed"), so that one field is a manual augmentation of the
otherwise-real `preToolUse` shape.

## AUCUNE CAPTURE AUTHENTIQUE DISPONIBLE (14 events)

The following 14 mandate events have zero authentic stdin capture on this machine (0 `Hook
step requested: <event>` log lines with a matching input/output block, or a step that fired
with no hook attached to log a payload). Their fixtures are entirely binary-verified/synthetic:

`sessionEnd`, `preCompact`, `subagentStart`, `subagentStop`, `postToolUse`,
`postToolUseFailure`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`,
`afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `stop`, `workspaceOpen`.

`workspaceOpen` fired 166 times in the logs but never with a configured hook, so even its
step-requested line carries no payload — 0/166 gave a capturable body.
