import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import { SITE } from './src/data/site';

/**
 * The Enfav LLC site: every page is prerendered to a static file in dist/,
 * which Cloudflare Workers Static Assets serves (wrangler.jsonc). There is no
 * adapter, so nothing can render on demand — a route that tried would fail the
 * build.
 */
export default defineConfig({
  site: SITE.origin,
  // Workers serves dist/<page>/index.html at /<page>/ and redirects /<page> to
  // it, so canonical URLs, sitemap entries and every internal link are the URL
  // that answers 200.
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  // Astro 7's default ('jsx') drops a line break next to an inline element, which
  // runs prose into its links. HTML whitespace rules instead; prettier.config.mjs
  // formats .astro files the same way.
  compressHTML: true,
  server: { port: 4203 },
  integrations: [sitemap()],
  image: {
    // getImage rasterizes the site's own SVGs (src/assets) into the Open Graph
    // and touch-icon PNGs at build time. No remote image is ever processed.
    dangerouslyProcessSVG: true,
  },
  vite: {
    // Nothing inline: every script and stylesheet ships as an /_astro file, so the
    // Content-Security-Policy in public/_headers can allow 'self' and nothing else.
    build: { assetsInlineLimit: 0 },
    // Pages render in Astro's `prerender` environment, where Vite's CSS @import
    // resolver externalizes a bare package and hands back the bare name — so
    // `@import 'tailwindcss'` would be opened as a file called "tailwindcss".
    // The stylesheet's packages are CSS, never runtime imports: resolve them.
    environments: { prerender: { resolve: { noExternal: ['tailwindcss'] } } },
  },
});
