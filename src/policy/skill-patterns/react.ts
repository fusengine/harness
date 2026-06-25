/**
 * React skill-trigger patterns, ported verbatim from `react_skill_triggers.py`.
 * Matched case-insensitively (source `re.IGNORECASE`).
 */
import { SHADCN } from "./shadcn";

/** Map of React sub-skill name → triggering code patterns. */
export const REACT_TRIGGERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "react-19": ["\\buse\\b\\s*\\(", "useOptimistic\\b", "useActionState\\b",
    "useEffectEvent\\b", "<Activity\\b", "from\\s+['\"]react['\"]"],
  "react-tanstack-router": ["(createRouter|createRoute|createRootRoute)\\b",
    "(useNavigate|useParams|useSearch|useLoaderData)\\b",
    "from\\s+['\"]@tanstack/(react-router|router)",
    "(routeTree|createFileRoute|createLazyFileRoute)\\b"],
  "react-forms": ["(useForm|useAppForm|createFormHook|formOptions)\\b",
    "(mergeForm|formApi|FieldApi|FormApi)\\b",
    "form\\.(Field|Subscribe|handleSubmit)\\b",
    "from\\s+['\"]@tanstack/(react-form|zod-form-adapter)"],
  "react-state": ["(create|createStore)\\(\\s*\\(\\s*set", "from\\s+['\"]zustand(/\\w+)?\"",
    "(useShallow|useStore|skipHydration)\\b", "(persist|devtools|immer)\\("],
  "react-testing": ["(render|screen|fireEvent|waitFor)\\b",
    "from\\s+['\"]@testing-library/react",
    "(describe|it|expect|vi\\.|jest\\.)\\b", "from\\s+['\"]vitest"],
  "react-shadcn": SHADCN,
  "react-i18n": ["(useTranslation|Trans)\\b", "from\\s+['\"]react-i18next",
    "\\bt\\(\\s*['\"]", "i18n\\.(language|changeLanguage)"],
};
