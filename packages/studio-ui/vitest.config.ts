/// <reference types='vitest' />
import { webTestConfig } from '../../vite.web';

/**
 * Deliberately `vitest.config.ts`, not `vite.config.ts`: project.json owns
 * build/serve (they are Next's, run through run-commands), so this file must
 * not tempt `@nx/vite` into inferring build targets. A vitest-named config
 * yields exactly the inferred `test` target and nothing else.
 */
export default webTestConfig(__dirname, 'studio-ui', {
  // React Flow needs more of a browser than jsdom provides; see the file.
  setupFiles: ['./src/vitest.setup.ts'],
});
