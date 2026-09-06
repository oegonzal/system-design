import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Shared Vite build shape for the NestJS apps (studio-api, eval-worker).
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
  /^@mikro-orm\//,
  'reflect-metadata',
  'rxjs',
  /^rxjs\//,
  'pg',
  'pg-native',
  /^class-validator/,
  /^class-transformer/,
  'express',
  /^node:.*/,
  'tslib',
];

/** `build` + `ssr` blocks for a single-entry CJS Nest bundle. */
export function nestBuildConfig() {
  return {
    plugins: [nxViteTsPaths()],
    build: {
      ssr: true,
      outDir: './dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      rolldownOptions: {
        input: 'src/main.ts',
        output: {
          format: 'cjs' as const,
          entryFileNames: '[name].js',
        },
        external: NEST_EXTERNALS,
      },
    },
    ssr: {
      noExternal: true as const,
    },
  };
}
