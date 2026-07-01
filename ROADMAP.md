# ROADMAP — @fusengine/harness

Améliorations futures (hors parité Python, déjà faite). Une case = une tâche.

## Harnais (adapters)

- [ ] **Support Hermes** — ajouter `hermes: ".hermes"` à `HOME_DIR` (`src/config/dotenv.ts`)
      + la détection dans `src/detect/harness.ts` (+ l'adapter `src/adapters/hermes/` si
      Hermes a un format de hook propre). Aujourd'hui un `~/.hermes/.env` est ignoré
      (fallback `.claude`). Ajouter aussi le wiring `init` (`src/init/templates.ts`).

## Configuration `.env`

- [ ] **TTL de cache configurables par env** — `WEBFETCH_TTL_MS` (24h) et `MCP_TTL_MS` (48h)
      sont des constantes en dur dans `src/runtime/mcp-key.ts`. Les exposer via
      `FUSE_WEBFETCH_TTL_SEC` / `FUSE_MCP_TTL_SEC` (parser `parseEnvInt`, `src/config/env.ts`).
- [ ] **Variantes `.env.local` / `.env.*`** — le loader (`src/config/dotenv.ts` `envCandidates`)
      ne sonde que `~/.<harness>/.env` et `<cwd>/.env`. Ajouter `.env.local` (et l'ordre de
      précédence) si besoin d'un override non versionné.

## Qualité / preuve de parité

- [x] **Harnais de test différentiel Python↔TS** — fait (`test/parity/`). Chaque payload d'une
      matrice de 38 commandes Bash `PreToolUse` est envoyé AU plugin Python `core-guards`
      (chaîne `bash-write`/`git`/`install`/`security`, via `python3`) ET au harness TS
      (`guard()`), avec assertion d'égalité des décisions (block/ask/allow) — `differential.test.ts`.
      Le différentiel tourne en local quand la référence Python est présente
      (`~/Downloads/agents-main/plugins/core-guards`, override `FUSE_PARITY_PYTHON_ROOT`) et
      s'auto-skippe en CI. Un **golden-snapshot** (`golden.test.ts` + `golden.snapshot.json`)
      verrouille la sortie exacte du harness et sert de filet anti-régression CI (sans Python).
      Écarts volontaires exclus de la matrice (cf. section suivante) + trouvés par le diff :
      fork bomb, `mkfs.ext4`, `dd of=/dev/*`, `chmod 777`, `eval` (TS bloque/ask, Python laisse passer).
      Limite connue restante : la matrice ne couvre que les guards de décision `PreToolUse` Bash ;
      les events de cycle de vie (SessionStart/injections) et les caches TTL restent non diffés.

## Écarts volontaires (assumés — à revoir si clone strict souhaité)

- interface-separation déclenche sur Edit (Python: Write seul)
- Edit sur fichier surdimensionné bloqué (Python: Edit exempté)
- doc gate accepte WebSearch/WebFetch en plus de context7/exa
- crédite `Agent` ET `Task` (Python: `Agent`)
- freshness ancrée sur le transcript (anti-forge) vs self-report Python

## Phase 2 — reliquats (LOW, non bloquants)

- [x] **Chemins harness-agnostiques (cache/état fuse-harness)** — le cache/état propre à
      fuse-harness (sessions, lessons, MCP cache, analytics) est déparenté de `~/.claude/` vers
      `~/.fuse-harness/cache/` (neutre, partagé entre tous les harnais). Les logs par-harness
      (`~/.claude/logs/00-*`) restent volontairement sous le home du harness détecté — hors scope
      de ce point (cache propre au harness vs logs par-harness sont deux choses différentes).
- [ ] **design** : regex « emoji-as-icon » (`content-checks.ts`) flagge tout non-ASCII → faux positif
      sur texte accenté (français/CJK) ; restreindre à la classe emoji du Python.
- [ ] **SEO** : matcher PostToolUse limité à `Write|Edit|MultiEdit` ; whitespace/entities/casse (port plus strict).
- [ ] **cartographer** : tri `localeCompare` → code-point (parité octet) ; diagnostics stderr absents.
- [ ] **rules/sécurité** : `??` vs `||` (query vide loggée), glob inclut dotfiles, forme de state.
- [ ] **aipilot** : `cache-doc` précédence cwd vs env.
- [ ] **Doc-honnêteté** : `src/runtime/lifecycle/memory/*` est une feature net-new (source `memory-neural`,
      autre repo) — reformuler les JSDoc « Ports X.py » trompeuses.

## Abandonné (décision)

- ~~Ralph-mode~~ (bypass git/install) — non porté volontairement
- ~~enforce-gemini-mcp~~ (guard Tailwind) — non porté volontairement
