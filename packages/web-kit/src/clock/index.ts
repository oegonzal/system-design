/**
 * @sysdesign/web-kit/clock — elapsed time as every app prints it: the
 * ticking clock, the server's clock as a page reads it, and the `m:ss` it is
 * printed in.
 *
 * Its own entry, apart from the `@sysdesign/web-kit` barrel, because it is
 * story-safe: it imports nothing of Next's, so a presentational component
 * that shows a running clock can still be in the Storybook catalog, which
 * must never load the barrel (see `../index.ts`).
 */
export * from './format-elapsed';
export * from './use-now';
export * from './use-server-now';
