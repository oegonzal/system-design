/// <reference types='vitest' />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vitest/config';

import { nestBuildConfig, testDatabaseEnv } from '../../vite.nest';

/** The specs that need Postgres: the persistence adapters and the HTTP surface. */
const DB_SPECS = ['src/**/persistence/*.spec.ts', 'src/app/http.spec.ts'];

/** Every variable a channels file in `config/channels/` binds, read from the files that bind them. */
function boundVariables(): string[] {
  const dir = join(__dirname, 'config', 'channels');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const kinds = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<
        string,
        { instances: Record<string, { env: Record<string, string> }> }
      >;
      return Object.values(kinds).flatMap((kind) =>
        Object.values(kind.instances).flatMap((instance) => Object.values(instance.env)),
      );
    });
}

const env = {
  ...testDatabaseEnv(),
  // Nx loads a developer's `.env` for local tasks; no suite may ever reach a real channel.
  ...Object.fromEntries(boundVariables().map((name) => [name, ''])),
};

export default defineConfig({
  root: __dirname,
  ...nestBuildConfig(),
  test: {
    root: __dirname,
    reporters: ['default'],
    // Two projects: the pure suites run in parallel; the Postgres suites
    // share one database, so they share one lane.
    projects: [
      {
        extends: true,
        test: {
          name: 'pure',
          globals: true,
          environment: 'node',
          env,
          include: ['src/**/*.{test,spec}.{ts,mts}'],
          exclude: DB_SPECS,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          env,
          include: DB_SPECS,
          fileParallelism: false,
        },
      },
    ],
  },
});
