/**
 * A lens persona is a markdown file beside its pipeline, imported as text.
 * Vite resolves `?raw` in the app build and under vitest; tsc only needs to
 * know the module exists.
 */
declare module '*.md?raw' {
  const text: string;
  export default text;
}
