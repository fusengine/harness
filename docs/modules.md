# modules reference

Compact API reference for the remaining core modules. All are pure or
file-I/O only — no harness coupling.

## cache — `@fusengine/harness/cache`
| Export | Description |
|--------|-------------|
| `compactMarkdown(content)` | strip HTML entities + boilerplate, collapse blank lines, truncate to ~5KB |
| `queryHash(tool, query)` | 8-char MD5 of `tool::query` |
| `jaccardSimilar(a, b, threshold=0.8)` | bag-of-words similarity `>` threshold |
| `loadIndex(path)` / `summarizeIndex(index)` | read/summarize a cache index |
| `extractText(resp)` | markdown from an MCP `tool_response` (string / blocks / json), depth-capped |

## freshness — `@fusengine/harness/freshness`
| Export | Description |
|--------|-------------|
| `isDocConsulted(auths, sessionId)` | true when **both** Context7 and Exa were consulted (live or via cache read) |
| `resolveSessions(auth)` | sessions array, legacy fallback |
| `formatDocDeny(framework)` | deny message |
| `incrementTrivialEditCounter(file, windowMs, now?)` | sliding-window edit count (injectable `now`) |

## refs — `@fusengine/harness/refs`
| Export | Description |
|--------|-------------|
| `parseFrontmatter(md)` | frontmatter key/values (quotes stripped) |
| `globToRe(glob)` | anchored RegExp from a `**`/`*` glob |
| `scoreReferences(refs, path, content)` | +10 glob / +5 trigger / +1 keyword |
| `routeReferences(refs, path, content, skillPath?)` | top-2 required + 2 optional, hoisting a principle + template |

## state — `@fusengine/harness/state`
| Export | Description |
|--------|-------------|
| `acquireLock(dir, timeoutMs=5000)` | directory lock (atomic `mkdir`, EEXIST = held) → release fn or null |
| `apexStateDir(home?)` / `stateFilePath(home?, today?)` | state paths |
| `loadState` / `saveState` | daily APEX state |
| `taskCreate / taskStart / taskComplete` | task.json CRUD |

## memory — `@fusengine/harness/memory`
| Export | Description |
|--------|-------------|
| `stateFileFor(root)` / `lessonsFileFor(root)` / `readState` / `setStateField` | per-project state at `<root>/.harness/memory/` |
| `throttleMs(env?)` | reminder window (`FUSE_LESSONS_THROTTLE_MIN`, default 5 min) |
| `nowStamp()` | `YYYY-MM-DD HH:MM` |
| `readRoots(home?)` / `addRoot(root, home?)` | multi-project registry |
| `ensureMemoryGitignore(dir)` | ignore `state.json` |

## statusline — `@fusengine/harness/statusline`
`formatPath`, `formatTokens`, `formatCost`, `formatTimeLeft`, `colors`,
`progressiveColor`, `generateProgressBar`, `generateGradientBar`.

## util — `@fusengine/harness/util`
`compactJson`, `projectRoot(dir)` / `projectRootOrNull(dir)` (.git-first),
`isCodeFile(path)`, `atomicWrite`, `readJsonFile` / `writeJsonFile`, `hashText`.
