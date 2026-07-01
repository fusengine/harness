/**
 * Detect the framework from a file path extension + content patterns.
 * Aligned with the fusengine require-solid-read detection (distinct from
 * {@link detectProjectType}, which scans config files on disk).
 */
export function detectFramework(filePath: string, content: string): string {
  if (/\.(tsx?|jsx?|vue|svelte)$/.test(filePath) || /from ['"]react|useState|className=/.test(content)) {
    if (/(page|layout|loading|error|route|middleware)\.(ts|tsx)$/.test(filePath) || /use client|use server|NextRequest|NextResponse|from ['"]next|getServerSideProps|getStaticProps/.test(content)) {
      return "nextjs";
    }
    return "react";
  }
  if (/\.swift$/.test(filePath)) return "swift";
  if (/\.php$/.test(filePath)) return "laravel";
  if (/\.java$/.test(filePath)) return "java";
  if (/\.go$/.test(filePath)) return "go";
  if (/\.rb$/.test(filePath)) return "ruby";
  if (/\.rs$/.test(filePath)) return "rust";
  if (/\.css$/.test(filePath) || /@tailwind|@apply/.test(content)) return "tailwind";
  return "generic";
}
