import { readFileSync } from 'node:fs';

/**
 * The workspace's Prettier options, read from the root `.prettierrc` rather
 * than restated, plus the Astro plugin — owned here so no other project ever
 * loads it. Prettier uses the nearest config file and never merges, which is
 * why the root options are spread in.
 */
const workspace = JSON.parse(readFileSync(new URL('../../.prettierrc', import.meta.url), 'utf8'));

export default {
  ...workspace,
  plugins: ['prettier-plugin-astro'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
  // Mirrors compressHTML: true in astro.config.ts — HTML whitespace rules.
  astroCompressHTML: 'html',
};
