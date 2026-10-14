# website

The public site of Enfav LLC at enfav.com — home, services, government (the capability statement,
which prints as one US-Letter page), about, contact and a 404, with a sitemap and robots.txt — built
with Astro, TypeScript and Tailwind and served by Cloudflare Workers Static Assets from
`wrangler.jsonc` (Worker `enfav-website`, custom domain `enfav.com`, no `*.workers.dev` copy). Every
page is prerendered to `dist/`: there is no adapter, no server and no client JavaScript, and
`public/_headers` gives every response a Content-Security-Policy that admits the site's own files
and nothing inline. Unit specs cover the static output, the structured data and the single origin,
and `tooling/website-imports.spec.ts` holds what the build imports to what the deploy workflow
watches; `packages/website-e2e` runs Playwright and axe over every built page as Workers serves it
— in CI, before each deploy, and against production after it.

```bash
pnpm website:serve                 # astro dev on :4203, for editing (no Workers routing or headers)
pnpm website:build                 # astro build → packages/website/dist
pnpm website:preview               # build, then wrangler dev over dist on :4204, as production serves it
pnpm exec nx run website-e2e:e2e   # build, then Playwright + axe against its own preview on :4205
pnpm exec nx test website          # the unit specs
```

Every company fact the site states lives in `src/data/` — `company.ts`, beside `founder.ts`,
`services.ts` and `site.ts` — as a `Fact` (`src/lib/fact.ts`) that is either `verified(…)` or
`placeholder(…)`. A placeholder renders as a visible `Placeholder — …` marker and never reaches the
JSON-LD; confirming one is a one-line change to `verified(…)`, with the value copied verbatim from
its source (for the registration details, the SAM.gov entity record, never
`packages/govcon/src/profiles/enfav.ts`). A credential appears only as a verified fact, and no
client or employer is ever named: the repository is public.

Tailwind CSS 4 is built for Chrome 111, Safari 16.4 and Firefox 128; since 4.1 its fallbacks keep
the pages rendering, degraded, in older browsers. It runs as a PostCSS plugin (`postcss.config.mjs`)
rather than through `@tailwindcss/vite`, because the Vite plugin resolves its `vite` peer from the
workspace root while Astro bundles its own newer Vite, and the plugin calls Vite at runtime, so one
build would mix two Vites.

Deploying (`pnpm website:deploy` once from a terminal, then CI), the one-time setup, rolling back
and validating production: [docs/enfav/website.md](../../docs/enfav/website.md).
