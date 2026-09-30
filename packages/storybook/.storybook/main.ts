import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import react from '@vitejs/plugin-react';
import type { StorybookConfig } from '@storybook/react-vite';

/**
 * The catalog host.
 *
 * Stories stay colocated with the components they document, so this globs
 * into sibling packages rather than owning any stories of its own. That is
 * also why Storybook is its own project: it is the only one allowed to depend
 * on both the design system and an app, and hosting it inside
 * `design-system` would put a backwards edge (library → app) into the Nx
 * graph.
 *
 * Policy (enforced by the smoke harness): only pure client components appear
 * in the catalog — nothing that imports `next/navigation` or other Next
 * runtime modules, which do not exist in this Vite builder.
 */
const config: StorybookConfig = {
  stories: [
    '../../design-system/src/**/*.stories.@(ts|tsx)',
    '../../studio-ui/src/**/*.stories.@(ts|tsx)',
    '../../quality-loop-ui/src/**/*.stories.@(ts|tsx)',
    '../../govcon-ui/src/**/*.stories.@(ts|tsx)',
  ],

  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],

  framework: {
    name: '@storybook/react-vite',
    options: {},
  },

  /**
   * Two gaps the host has to close itself:
   *
   * - Vite does not read tsconfig path aliases, so without `nxViteTsPaths`
   *   every `@sysdesign/*` import in a story fails to resolve.
   * - `studio-ui`'s tsconfig says `jsx: "preserve"` (Next owns its JSX), so
   *   Vite's tsconfig-driven native transform leaves that package's JSX
   *   untouched and the build dies parsing it. An explicit React plugin —
   *   with Emotion's JSX runtime, matching the packages' own test configs —
   *   transforms everything uniformly.
   */
  viteFinal: async (viteConfig) => {
    viteConfig.plugins = [
      react({ jsxImportSource: '@emotion/react' }),
      ...(viteConfig.plugins ?? []),
      nxViteTsPaths(),
    ];
    return viteConfig;
  },
};

export default config;
