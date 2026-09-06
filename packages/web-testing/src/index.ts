/**
 * @sysdesign/web-testing — the spec harness the web apps share: a themed
 * render, a scripted fetch stub, a `next/navigation` mock and the jsdom shims.
 * Imported only by specs and `vitest.setup.ts`; it pulls in testing-library
 * and vitest, so no runtime file or story may import it.
 */
export * from './dom-shims';
export * from './next-navigation';
export * from './render';
export * from './stub-api';
