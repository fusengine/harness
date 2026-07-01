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
- [x] **Audit de parité complet agents-main → fuse-harness (2026-07-01)** — les 20 plugins de
      `agents-main/plugins/` audités script-par-script (logique réelle comparée, pas seulement les
      JSDoc « Ports X.py ») par une équipe de 4 : core-guards/claude-rules/solid/cartographer/
      changelog-watcher (100% portés sauf `solid`, cf. reliquats) ; ai-pilot/design-expert/
      security-expert/fuse-lessons/commit-pro (couverture solide, 2 scripts ai-pilot manquants —
      portés, cf. CHANGELOG) ; react/nextjs/astro/shadcn/tailwindcss (shadcn-expert entièrement
      absent — porté ; routage tailwind cassé — corrigé) ; laravel/swift/prompt-engineer/seo/_shared
      (2 divergences comportementales réelles trouvées, non corrigées — cf. reliquats). Régression
      systémique confirmée par 3 équipes indépendantes sans coordination : le gate MCP doc
      `context7 ET exa` (Python, `check_skill_common.py::mcp_research_done`) était devenu
      `context7 OU exa OU web` (OR pur) côté TS — corrigé en `(context7 ET exa) OU fuse-browser
      seul` (le fallback web reste une addition TS délibérée, `fuse-browser` étant le fast-path de
      recherche doc documenté dans le CLAUDE.md de l'utilisateur — pas une divergence à corriger).

## Écarts volontaires (assumés — à revoir si clone strict souhaité)

- interface-separation déclenche sur Edit (Python: Write seul)
- Edit sur fichier surdimensionné bloqué (Python: Edit exempté)
- doc gate exige `context7` ET `exa` (parité stricte) OU un fallback web (WebSearch/WebFetch/
  fuse-browser) seul — le fallback web-seul est une addition TS délibérée (fast-path documenté),
  pas une divergence de rigueur comme l'était l'ancien `context7 OU exa OU web` pur (corrigé)
- crédite `Agent` ET `Task` (Python: `Agent`)
- freshness ancrée sur le transcript (anti-forge) vs self-report Python
- pipeline design (`SubagentStart`/`SubagentStop`/`agent_id`) explicitement limité à
  `detectHarness().id === "claude-code"` (`src/runtime/handle.ts`) — ces concepts sont le
  vocabulaire du Agent SDK Claude Code ; Codex/Cursor n'ont pas d'équivalent sous-agent
- `gate-helpers.ts::isApexScoped` (`CODE_EXT`) exclut délibérément `.css`/`.html`/`.json` du
  périmètre des gates APEX (doc/SOLID) — le Python `enforce-apex-phases.ts` inclut `.css` dans
  son `CODE_EXT` ; décision produit explicite de ne PAS porter ce point, pas un oubli

## Phase 2 — reliquats (LOW, non bloquants)

- [x] **Chemins harness-agnostiques (cache/état fuse-harness)** — le cache/état propre à
      fuse-harness (sessions, lessons, MCP cache, analytics) est déparenté de `~/.claude/` vers
      `~/.fuse-harness/cache/` (neutre, partagé entre tous les harnais). Les logs par-harness
      (`~/.claude/logs/00-*`) restent volontairement sous le home du harness détecté — hors scope
      de ce point (cache propre au harness vs logs par-harness sont deux choses différentes).
- [x] **cartographer** : tri `localeCompare` → code-point (parité octet), fait (`.sort()` bare).
- [x] **Doc-honnêteté** : `src/runtime/lifecycle/memory/*` — JSDoc « Ports X.py » corrigées pour
      référencer explicitement le plugin séparé `fuse-memory-neural` (pas agents-main).
- [ ] **design** : regex « emoji-as-icon » (`content-checks.ts`) flagge tout non-ASCII → faux positif
      sur texte accenté (français/CJK) ; restreindre à la classe emoji du Python.
- [ ] **SEO** : matcher PostToolUse limité à `Write|Edit|MultiEdit` ; whitespace/entities/casse (port plus strict).
- [ ] **rules/sécurité** : `??` vs `||` (query vide loggée), glob inclut dotfiles, forme de state.
- [ ] **aipilot** : `cache-doc` précédence cwd vs env.
- [x] **SOLID — comptage de lignes** : Python (`validate_solid_common.py::count_code_lines`) exclut
      lignes vides/commentaires du comptage ; le TS (`file-size.ts::countLines`,
      `framework-solid-gates.ts`) comptait les lignes physiques brutes. Corrigé : nouveau
      `countFrameworkCodeLines` (exclut vide/`//`/`*`) utilisé par les 4 gates react/next/laravel/swift ;
      `evaluate.ts` (core-guards générique, parité `enforce-file-size.py`) garde volontairement le
      comptage brut — ce n'est pas la même règle Python.
- [x] **`solid/validate-solid.py`** : les règles spécifiques Go (`check_go`) et Python/ABC
      (`check_python`) n'avaient aucun équivalent TS. Portées dans `runtime/lifecycle/validate-solid.ts`
      (scope `solid`, PreToolUse) — `check_nextjs`/`check_laravel`/`check_swift` du même script
      délibérément NON repris car déjà couverts, plus rigoureusement, par `framework-solid-gates.ts`.
- [x] **`tailwindcss/validate-tailwind.py`** : avertissements PostToolUse (directive `@tailwind`
      dépréciée, `@apply` excessif >10, `className` >150 caractères) — porté dans
      `runtime/lifecycle/validate-tailwind.ts` (nouveau scope `tailwindcss`).
- [x] **`_shared/project_detect.py::is_tailwind_project`** : fallback « `tailwindcss` en dépendance
      `package.json` » (Tailwind v4 CSS-first sans fichier de config) — ajouté à
      `detect-project.ts::detectProjectType` (`hasTailwindDependency`).
- [ ] **`ai-pilot/lib/apex/doc-helpers.ts` (Python source, malgré l'extension `.ts`) — reformulé,
      correction d'une erreur d'attribution** : le TS harness (`freshness/doc-helpers.ts`) porte
      bien ce fichier (mêmes noms `isDocConsulted`/`resolveSessions`/`formatDocSatisfactionStatus`,
      même AND strict context7+exa côté source — pas `_shared/tracking.py::check_skill_common.py`
      comme précédemment écrit par erreur dans ce ROADMAP). CE mécanisme (pooling session-wide
      des sources par framework, `isDocConsulted`) est correctement porté. Un SECOND mécanisme
      Python distinct, non vérifié comme porté, reste ouvert : `enforce-apex-phases.ts::isAuthorized`
      + `track-doc-consultation.py` — un `doc_consulted` horodaté PAR FRAMEWORK (détecté depuis le
      fichier édité, pas la requête), avec cross-update vers `state.target.framework` (le framework
      du dernier deny) quand la requête de recherche détecte un framework différent du fichier cible.
      Sert le check "SOLID refs" (TTL framework-spécifique), pas le check "recherche en ligne"
      (session-wide, déjà correct). À vérifier dans une prochaine session — non exploré ici.
- [x] **`bash-write-safe-paths.ts`** : `target.startsWith(safe)` sans frontière de segment,
      `stripped.startsWith("~")` sur-expansant `~foo`/`~1`, `hasSafeWriteTarget` non ancré au
      chemin extrait — les 3 corrigés (frontière `+"/"`, tilde POSIX strict, ancrage par guillemets
      incl. sous-chemin `'p/`). Note : ancrage `hasSafeWriteTarget` est un durcissement AU-DELÀ de
      la parité stricte (le Python `safe_paths.py` a le même défaut sur ce point précis) — volontaire.
- [x] **ai-pilot — audit des ~34 scripts `.ts` source (36 avec 2 supplémentaires trouvés)** : 28 bien
      portés (logique vérifiée équivalente). 2 manquants : `detect-and-inject-apex.ts` (aucun hook
      UserPromptSubmit n'injecte "Use APEX methodology" ni n'auto-initialise `.claude/apex/` —
      `getExpertAgent`/`AGENT_MAP` absents, les helpers portés dans `detect-project.ts` sont orphelins)
      et `init-apex-tracking.ts` (rien ne crée `.claude/apex/task.json` + `AGENTS.md` + entrée
      `.gitignore` — le harness ne fait que LIRE un `.claude/apex/` déjà existant). 6 divergences
      comportementales réelles trouvées, non corrigées cette session (impact pratique jugé faible à
      moyen) :
      - [x] `doc-cache-gate.ts` : la branche Context7 de `libraryOf()` était un gate mort en
        pratique — corrigée pour exiger `libraryId` ET `query`. Note : le diagnostic initial
        (« source exige `topic` ») était FAUX — vérifié contre le schéma MCP context7 réel
        (upstash/context7 2026 : `{libraryId, query}`, aucun champ/alias `topic`) et contre les
        usages internes déjà cohérents (`cache-doc.ts`, `mcp-key.ts`, tous deux sur `query`).
      - [x] `enforce-apex-phases.ts`/`lib/apex/trivial-edit-counter.ts` : le fast-path "trivial edit"
        source ne s'applique qu'à `Edit` ; corrigé (`gate-apex.ts` teste maintenant `input.tool === "Edit"`)
        — un `Write` passe désormais toujours par le gate complet.
      - `lib/apex/detection.ts` : logique portée (`detect-project.ts`) mais orpheline (cf. les 2
        scripts manquants ci-dessus) — jamais appelée par un gate. Non corrigé.
      - `lib/apex/state.ts` : fonctions portées à l'identique (`state/apex-state.ts`) mais jamais
        appelées des deux côtés (code mort confirmé, pas une divergence de comportement).
- [ ] **Course TTL fraîcheur vs latence async des sous-agents (2026-07-01, reliquat rouvert)** :
      `agentsRanFromTranscript` ancre la fraîcheur sur l'horodatage de l'entrée `Task`/`Agent` — le
      moment du LANCEMENT (asynchrone, non-bloquant), pas de la fin. Un sous-agent imbriqué
      (`explore-codebase`/`research-expert`) peut mettre >60s à finir dans la pratique (68s observés
      réellement cette session), ce qui, cumulé au temps de retry d'un sniper qui échoue puis
      réessaie un Edit, dépasse facilement la fenêtre de 120s (2min, parité stricte Python
      `apex_agent_helpers.py::_enforce_ttl_seconds`). Une tentative d'élargir `DEFAULT_TTL_SEC`/
      `DEFAULT_WINDOW_MS` à 300s (5min) a été appliquée puis **explicitement revertée sur décision
      utilisateur** (parité stricte préférée à une divergence produit) — le Python n'a pas cette race
      grâce à son écriture temps-réel par appel (`track-subagent-research.py`), indépendante du
      lancement du sous-agent parent. Reste donc un problème réel, non résolu : une piste alternative
      (hors élargissement de fenêtre) serait d'ancrer la fraîcheur sur la FIN du `Task`/`Agent`
      plutôt que son lancement, si le transcript expose cette info — non explorée cette session.
- [x] **`TTL_SECONDS = 604_800` (cache doc Context7/Exa, 7j) dupliqué en 2 littéraux indépendants** :
      `inject-doc.ts` et `doc-cache-gate.ts` définissaient chacun leur propre constante pour le MÊME
      cache — corrigé en extrayant `DOC_CACHE_TTL_SECONDS` dans `cache-base.ts`, importée des deux
      côtés. `inject-explore.ts`/`inject-test.ts` gardent leurs propres `TTL_SECONDS` (86400/172800) —
      caches différents, pas concernés.
- [x] **`solidReadGate` (`apex.ts`) message pauvre vs Python `formatRoutedDeny`** : n'affichait ni le
      label TTL, ni les refs `optional`, ni le `Full skill:` (chemin du skill complet) — corrigé,
      `reason` inclut désormais les 3. `actions` reste `required` seul (inchangé). **Reliquat signalé
      par le sniper** : `routed.skillPath` est garanti vide en pratique — `solidReadGate` appelle
      `routeReferences(ctx.refs, ctx.filePath, ctx.content)` sans 4e argument, et rien dans
      `ApexContext`/`GateInput`/`gate-apex.ts` ne fournit de `skillPath` résolu à ce jour. La ligne
      "Full skill:" s'affichera donc vide tant que ce câblage n'est pas fait — hors scope de ce fix.
- [x] **Message `enforce-file-size.py` (SOLID) jamais enrichi côté port** : le Python inclut le nom
      de fichier, un chemin de référence SOLID résolu par framework
      (`react-expert/skills/solid-react/` etc.) et un plan en 3 étapes ; le TS ne disait que "File
      has N lines (max: M)." — corrigé, `evaluateFileSize()` accepte maintenant `filePath`/`framework`
      optionnels et produit le même message enrichi. Le chemin `~/.claude/plugins/marketplaces/
      fusengine-plugins/plugins` reste en dur, non résolu dynamiquement — VRAIE parité avec Python
      (dont le littéral est aussi non résolu), pas un nouveau bug ; signalé comme incohérent avec la
      convention multi-harnais du reste du repo (`discoverRefs`), mais corriger ça est un changement
      d'architecture plus large, hors scope ici.

## Abandonné (décision)

- ~~Ralph-mode~~ (bypass git/install) — non porté volontairement
- ~~enforce-gemini-mcp~~ (guard Tailwind) — non porté volontairement
