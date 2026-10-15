/** Bun `import … with { type: "text" }` for bundled skill sources (PLAN 0.31.0 UK-7). */
declare module "*.md" {
  const text: string;
  export default text;
}
