/**
 * Bun `import … with { type: "text" }` for bundled skill sources (PLAN 0.31.0 UK-7).
 * Scoped to SKILL.md files only; other `.md` imports stay unresolved.
 */
declare module "*/SKILL.md" {
  const text: string;
  export default text;
}

/** Bundled rule text (PLAN 0.35.0 R12) — same text-import mechanism as SKILL.md. */
declare module "*/rules/report-blockers.md" {
  const text: string;
  export default text;
}
