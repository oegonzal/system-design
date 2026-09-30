/// <reference types='vitest' />
import { webTestConfig } from '../../vite.web';

/**
 * Deliberately declares no `build` block and ships no `index.html`.
 *
 * `@nx/vite/plugin` gates its build/serve/preview targets on `isBuildable`
 * (`build.lib || build.rolldownOptions.input || index.html`). With none of those
 * present it infers exactly two targets — `test` and `typecheck` — which is all
 * this package wants: it is consumed as TypeScript source through the path alias
 * and inlined by whichever app imports it, same as `@sysdesign/contracts`.
 */
export default webTestConfig(__dirname, 'design-system', {
  // jsdom lacks matchMedia, ResizeObserver and scrollIntoView; the file stubs them.
  setupFiles: ['./src/test-setup.ts'],
});
