import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'astro/config';

import { watchedInputs } from './integrations/watched-inputs';
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
  // watchedInputs fails the build when a file its tools report reading lies outside what the
  // deploy workflow watches; its header names the reads no tool reports.
  integrations: [sitemap(), watchedInputs()],
  image: {
    // getImage rasterizes the site's own SVGs (src/assets) into the Open Graph
    // and touch-icon PNGs at build time. No remote image is ever processed.
    dangerouslyProcessSVG: true,
  },
  vite: {
    // Nothing inline: every script and stylesheet ships as an /_astro file, so the
    // Content-Security-Policy in public/_headers can allow 'self' and nothing else.
    build: { assetsInlineLimit: 0 },
    // Tailwind runs as a PostCSS plugin, not through @tailwindcss/vite. The Vite
    // plugin resolves its `vite` peer from the workspace root, which pins the Vite
    // every other package builds with, while Astro bundles its own newer Vite — and
    // the plugin calls Vite at runtime, so one build would mix two Vites. The
    // PostCSS plugin depends on neither. Declared here because watchedInputs
    // appends its recorder to this list; Vite then reads no PostCSS config file.
    // CSS Modules stay off: postcss-modules reads the file a `composes … from`
    // names itself and reports nothing watchedInputs could record.
    css: { modules: false, postcss: { plugins: [tailwindcss()] } },
    // Pages render in Astro's `prerender` environment, where Vite's CSS @import
    // resolver externalizes a bare package and hands back the bare name — so
    // `@import 'tailwindcss'` would be opened as a file called "tailwindcss".
    // The stylesheet's packages are CSS, never runtime imports: resolve them.
    environments: { prerender: { resolve: { noExternal: ['tailwindcss'] } } },
  },
});
