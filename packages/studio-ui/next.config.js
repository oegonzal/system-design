const path = require('path');
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

/**
 * Next inside an Nx/pnpm workspace with hoisted deps and project.json-only
 * packages:
 *
 * - `externalDir` lets SWC compile sibling-package *sources* (the tsconfig
 *   `paths` aliases point at `packages/x/src/index.ts`, not built npm
 *   packages — `transpilePackages` does not apply).
 * - `outputFileTracingRoot` names the real workspace root so Next stops
 *   guessing it from the nearest lockfile.
 * - `compiler.emotion` is the SWC half of Emotion; the Vite side (tests,
 *   Storybook) configures the Babel plugin instead.
 * - `distDir` is `.next-dev` under `next dev` and `.next` otherwise, so a
 *   build never clobbers the running dev server's chunks (nor the reverse).
 *   `next-env.d.ts` is regenerated per distDir and stays untracked; the two
 *   stable references live in `src/next-types.d.ts`.
 *
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
module.exports = (phase) => ({
  reactStrictMode: true,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  compiler: {
    emotion: true,
  },
  experimental: {
    externalDir: true,
  },
});
