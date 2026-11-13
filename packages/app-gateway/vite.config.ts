/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';

import { nestBuildConfig } from '../../vite.nest';
import { APP_GATEWAY_ENV } from './src/config';

/**
 * The gateway is bundled the way the Nest apps are — one CJS `dist/main.js`
 * with every dependency inlined but the node built-ins — because that one
 * file is what the Lambda deployment package carries. It imports none of the
 * Nest externals, so the shared list costs it nothing. The AWS SDK loads its
 * protocol code through dynamic imports, which the bundler would otherwise
 * split into chunks beside the entry; code splitting is off so the file
 * stands alone and exports the two handlers and nothing else.
 *
 * Nx loads a developer's `.env` for local tasks; no suite may read a real
 * gateway setting, so every variable the package declares is blanked.
 */
const env = Object.fromEntries(
  Object.values(APP_GATEWAY_ENV)
    .flatMap((rows) => Object.values(rows))
    .map(({ name }) => [name, '']),
);

const nest = nestBuildConfig();

export default defineConfig({
  root: __dirname,
  ...nest,
  build: {
    ...nest.build,
    rolldownOptions: {
      ...nest.build.rolldownOptions,
      output: { ...nest.build.rolldownOptions.output, codeSplitting: false },
    },
  },
  test: {
    root: __dirname,
    globals: true,
    environment: 'node',
    env,
    include: ['src/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
  },
});
