import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// By path, not alias: a Vite config is loaded before any plugin resolves one.
import { TEST_DATABASE_NAME } from './packages/db/src/testing/test-database';

/**
 * Shared Vite build shape for every NestJS app (studio-api, quality-loop, govcon,
 * notifications, job-application, agentic-system, gmail, google-calendar) —
 * the ones `docker/nest-app.Dockerfile` builds from it.
 *
 * One externals list, maintained once: everything here stays a runtime
 * `require` in the bundled `dist/main.js` and is provided by `node_modules`
 * (prod-installed in the Docker image). Workspace packages (`@sysdesign/*`)
 * are deliberately NOT external — they are TypeScript sources resolved by
 * `nxViteTsPaths` and inlined into the bundle, which is what lets a package
 * ship a `project.json` instead of a publishable `package.json`.
 */
export const NEST_EXTERNALS = [
  /^@nestjs\//,
  // The Anthropic SDKs stay external: the Agent SDK locates its native CLI
  // binary (an optional platform package) relative to its own installed path,
  // which an inlined copy under dist/ cannot do.
  /^@anthropic-ai\//,
  // Playwright stays external for the same reason: it locates its browsers and
  // its driver relative to its own installed path.
  /^playwright(\/|$)/,
  /^playwright-core(\/|$)/,
  /^@mikro-orm\//,
  'reflect-metadata',
  'rxjs',
  /^rxjs\//,
  'pg',
  'pg-native',
  'express',
  /^node:.*/,
  'tslib',
];

/**
 * `vite build --watch` is what the apps' `serve` targets run beside
 * `node --watch dist/main.js`: a watch build must not empty `dist/` on its
 * first pass, or the process serving from it restarts into a missing file.
 */
const watching = process.argv.includes('--watch') || process.argv.includes('-w');

export interface NestBuildOptions {
  /** Externals one package alone needs — a native or CJS-only reader — beside the shared list. */
  externals?: readonly (string | RegExp)[];
}

/** `build` + `ssr` blocks for a single-entry CJS Nest bundle. */
export function nestBuildConfig(options: NestBuildOptions = {}) {
  return {
    plugins: [nxViteTsPaths()],
    build: {
      ssr: true,
      outDir: './dist',
      emptyOutDir: !watching,
      sourcemap: true,
      minify: false,
      rolldownOptions: {
        input: 'src/main.ts',
        output: {
          format: 'cjs' as const,
          entryFileNames: '[name].js',
        },
        external: [...NEST_EXTERNALS, ...(options.externals ?? [])],
      },
    },
    ssr: {
      noExternal: true as const,
    },
  };
}

/**
 * The database a package's suites run against: the disposable test database
 * unless the environment names one — a lane of its own, or CI's. A package
 * whose suites empty tables another package's suites also fill names its own
 * `lane`, so two suites run at once never truncate each other's rows. Whatever
 * it names, `ensureDatabase` and `truncateTestTables` refuse anything that is
 * not a test database, so a `DB_NAME` pointing at real data stops the suite at
 * boot rather than wiping it.
 */
export function testDatabaseEnv(lane?: string): { DB_NAME: string } {
  const laneDatabase = lane === undefined ? TEST_DATABASE_NAME : `${TEST_DATABASE_NAME}_${lane}`;
  return { DB_NAME: process.env['DB_NAME'] ?? laneDatabase };
}
