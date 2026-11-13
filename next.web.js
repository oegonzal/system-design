const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/**
 * The one Next config the web apps (studio-ui, quality-loop-ui, govcon-ui)
 * share; each app's `next.config.js` is `module.exports = require(...)` of
 * this file. Next inside an Nx/pnpm workspace with hoisted deps and
 * project.json-only packages:
 *
 * - `externalDir` lets SWC compile sibling-package *sources* (the tsconfig
 *   `paths` aliases point at `packages/x/src/index.ts`, not built npm
 *   packages — `transpilePackages` does not apply).
 * - `outputFileTracingRoot` names the real workspace root — this file's
 *   directory — so Next stops guessing it from the nearest lockfile.
 * - `output: 'standalone'` makes a build write a server of its own with only
 *   the files it traced: `.next/standalone/packages/<app>/server.js` (the
 *   tree keeps the workspace's shape because the tracing root is the
 *   workspace), which the `start` targets and the container image run. The
 *   static chunks are not traced into it; whoever runs that server copies
 *   `.next/static` beside it first. `next dev` ignores the setting.
 * - `basePath` is the prefix the app is served under, read from
 *   `NEXT_BASE_PATH` at build time so one app can be built for the root or
 *   for a path (`/inspector`) without a config of its own; unset, the app is
 *   at the root. A prefix must look like one — a leading `/`, no trailing
 *   one — or Next would fail every route, so a wrong one is refused here, by
 *   name.
 * - `compiler.emotion` is the SWC half of Emotion; the Vite side (tests,
 *   Storybook) uses Emotion's JSX runtime (`jsxImportSource`) instead.
 * - `distDir` is `.next-dev` under `next dev` and `.next` otherwise, so a
 *   build never clobbers the running dev server's chunks (nor the reverse).
 *   `NEXT_DIST_DIR` overrides both for a server that must share nothing with
 *   either: the e2e suite's own UI builds into `.next-e2e`, so it can run
 *   beside a developer's dev server in the same checkout. Each of the three
 *   is ignored everywhere `.next` is, and listed in the app's tsconfig, which
 *   Next would otherwise rewrite to add it. `next-env.d.ts` is regenerated
 *   per distDir and stays untracked; the two stable references live in each
 *   app's `src/next-types.d.ts`.
 *
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
module.exports = (phase) => ({
  reactStrictMode: true,
  output: 'standalone',
  ...basePathFromEnv(process.env.NEXT_BASE_PATH),
  distDir:
    process.env.NEXT_DIST_DIR ?? (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'),
  outputFileTracingRoot: __dirname,
  compiler: {
    emotion: true,
  },
  experimental: {
    externalDir: true,
  },
});

/**
 * The `basePath` entry for the prefix the environment names, or no entry at
 * all where it names none (an empty value is none: a build argument left at
 * its default).
 *
 * @param {string | undefined} prefix
 * @returns {{ basePath?: string }}
 */
function basePathFromEnv(prefix) {
  if (prefix === undefined || prefix === '') return {};
  if (!prefix.startsWith('/') || prefix.endsWith('/')) {
    throw new Error(
      `NEXT_BASE_PATH must start with "/" and not end with one, got ${JSON.stringify(prefix)}`,
    );
  }
  return { basePath: prefix };
}
