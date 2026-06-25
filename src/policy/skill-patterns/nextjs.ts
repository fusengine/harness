/**
 * Next.js skill-trigger patterns, ported verbatim from `nextjs_skill_triggers.py`.
 * Matched case-insensitively (source `re.IGNORECASE`).
 */
import { SHADCN } from "./shadcn";

/** Map of Next.js sub-skill name → triggering code patterns. */
export const NEXTJS_TRIGGERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "better-auth": ["(authClient|betterAuth|createAuthClient)\\b",
    "(signIn|signUp|signOut|useSession|getSession)\\b", "auth\\.(api|handler)\\b",
    "(prismaAdapter|drizzleAdapter|mongodbAdapter)\\b",
    "(twoFactor|passkey|magicLink|emailOtp|organization)\\b",
    "(apiKey|bearer|jwt|sso|scim|captcha|anonymous)\\b", "from\\s+['\"].*better-auth"],
  "nextjs-tanstack-form": ["(useForm|useAppForm|createFormHook|formOptions)\\b",
    "(mergeForm|formApi|FieldApi|FormApi)\\b",
    "form\\.(Field|Subscribe|handleSubmit)\\b", "(zodValidator|onServerValidate)\\b",
    "from\\s+['\"]@tanstack/(react-form|zod-form-adapter)"],
  "prisma-7": ["(PrismaClient|prismaAdapter)\\b", "prisma\\.(\\w+\\.\\w+|\\$\\w+)",
    "(globalForPrisma|\\$transaction|\\$queryRaw|\\$executeRaw)\\b",
    "from\\s+['\"](@prisma|\\..*generated.*prisma)"],
  "nextjs-shadcn": SHADCN,
  "nextjs-zustand": ["(create|createStore)\\(\\s*\\(\\s*set", "from\\s+['\"]zustand(/\\w+)?\"",
    "(useShallow|useStore|skipHydration)\\b", "\\.(getState|setState|subscribe)\\(\\)",
    "(persist|devtools|immer)\\("],
  "nextjs-i18n": ["(useTranslations|useLocale|useMessages|useFormatter)\\b",
    "(getTranslations|getLocale|getMessages|getFormatter)\\b",
    "(NextIntlClientProvider|defineRouting)\\b", "from\\s+['\"]next-intl(/\\w+)?\"",
    "\\bt\\(\\s*['\"]"],
};
