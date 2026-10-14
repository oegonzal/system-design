import tsEslint from '@typescript-eslint/eslint-plugin';
import astro from 'eslint-plugin-astro';

import workspace, { unusedBindings } from '../../eslint.config.mjs';

/**
 * The site's lint config: the workspace rules, plus what only `.astro` files
 * need, owned here.
 *
 * Flat config does not cascade — ESLint uses the nearest config file — so the
 * workspace config is restated and three things are added:
 *   - eslint-plugin-astro's recommended rules;
 *   - its accessibility rules, backed by eslint-plugin-jsx-a11y-x (the original
 *     jsx-a11y does not support ESLint 10). That preset's last block carries no
 *     `files`, so it is scoped to `.astro` here rather than leaking JSX parser
 *     options onto every file;
 *   - the workspace's unused-binding policy, which the root config scopes to
 *     ts/js files and so never applies to component frontmatter.
 */
const accessibility = astro.configs['jsx-a11y-recommended'].map((config) =>
  config.files === undefined && config.rules !== undefined
    ? { ...config, files: ['**/*.astro'] }
    : config,
);

export default [
  ...workspace,
  { ignores: ['.astro/'] },
  ...astro.configs.recommended,
  ...accessibility,
  {
    files: ['**/*.astro'],
    plugins: { '@typescript-eslint': tsEslint },
    rules: { '@typescript-eslint/no-unused-vars': unusedBindings },
  },
];
