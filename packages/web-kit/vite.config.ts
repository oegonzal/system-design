/// <reference types='vitest' />
import { webTestConfig } from '../../vite.web';

/**
 * No `build` block and no `index.html`, like design-system: `@nx/vite/plugin`
 * then infers only `test` and `typecheck`, and the package is consumed as
 * TypeScript source through its path alias.
 */
export default webTestConfig(__dirname, 'web-kit');
