/// <reference types='vitest' />
import { webTestConfig } from '../../vite.web';

/**
 * Deliberately `vitest.config.ts`, not `vite.config.ts`: project.json owns
 * build/serve through Next, and a vitest-named config yields exactly the
 * inferred `test` target and nothing else.
 */
export default webTestConfig(__dirname, 'govcon-ui', { setupFiles: ['./src/vitest.setup.ts'] });
