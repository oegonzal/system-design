const path = require('path');

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
 *
 * @type {import('next').NextConfig}
 */
module.exports = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  compiler: {
    emotion: true,
  },
  experimental: {
    externalDir: true,
  },
};
