/**
 * @sysdesign/web-kit — the Next apps' shared runtime plumbing: the Emotion
 * SSR registry, the typed HTTP request core, the route table and its
 * announcer, and the hooks a page composes its reads and writes from —
 * last-write-wins, status-driven polling, one resource, a paged list, one
 * action, a debounced value, a document title, a leave guard. Knows no
 * domain.
 *
 * App-runtime only. The registry and the announcer import `next/navigation`,
 * so a story must never import this barrel — directly or through a
 * component — or the catalog's Vite build drags the Next runtime in. What a
 * presentational component needs is a separate, story-safe entry instead:
 * `@sysdesign/web-kit/clock` (the elapsed clock), never re-exported here, so
 * each thing has one import path.
 */
export * from './emotion-registry';
export * from './http/request';
export * from './hooks/use-action';
export * from './hooks/use-debounced-value';
export * from './hooks/use-document-title';
export * from './hooks/use-latest-request';
export * from './hooks/use-leave-guard';
export * from './hooks/use-paged-list';
export * from './hooks/use-polled-resource';
export * from './hooks/use-resource';
export * from './navigation/nav-table';
export * from './navigation/route-announcer';
