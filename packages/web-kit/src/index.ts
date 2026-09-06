/**
 * @sysdesign/web-kit — the Next apps' shared runtime plumbing: the Emotion
 * SSR registry, the typed HTTP request core, and the last-write-wins and
 * status-driven polling hooks. Knows no domain.
 *
 * App-runtime only. The registry imports `next/navigation`, so a story must
 * never import this barrel — directly or through a component — or the
 * catalog's Vite build drags the Next runtime in.
 */
export * from './emotion-registry';
export * from './http/request';
export * from './hooks/use-latest-request';
export * from './hooks/use-polled-resource';
