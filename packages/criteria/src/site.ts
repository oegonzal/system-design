import type { Criterion } from './criterion';

/** The Enfav LLC website (packages/website): a marketing site statically built with Astro. */
export const SITE_CRITERIA: readonly Criterion[] = [
  {
    id: 'SITE-1',
    statement:
      'Every page is statically generated: the site’s Astro config declares no adapter and no server output, so nothing is rendered on request.',
  },
  {
    id: 'SITE-2',
    statement:
      'Every page has a title and description of its own and a canonical URL equal to its sitemap entry, the sitemap lists exactly the built pages, the link-preview image is a PNG of its declared size, and the 404 page is kept out of search.',
  },
  {
    id: 'SITE-3',
    statement:
      'Every page, the 404 included, passes axe’s WCAG 2.2 A and AA rules and best practices, reflows at 320 CSS pixels without sideways scrolling, and keeps keyboard focus visible, in forced-colors mode too.',
  },
  {
    id: 'SITE-4',
    statement:
      'The capability statement’s company data and every person the site names are rendered from declared facts, the structured data writes each fact’s value and never the fact, and no credential claim appears anywhere but through a verified fact.',
  },
  {
    id: 'SITE-5',
    statement:
      'The site is checked as Cloudflare serves it: every built file is served unchanged, a page asked for without its trailing slash redirects to it, an unknown path gets the 404 page with a 404 status, every response carries the declared headers, and no page needs anything inline the Content-Security-Policy would have to allow.',
  },
  {
    id: 'SITE-6',
    statement:
      'The production origin is one fact — the Worker’s custom domain is the host of the site’s origin — and the site imports nothing the deploy workflow’s change detection cannot see.',
  },
  {
    id: 'SITE-7',
    statement:
      'The government page is the capability statement, and prints on at most two US Letter pages.',
  },
  {
    id: 'SITE-8',
    statement:
      'The founder’s prior employment is listed one employer per entry, each with its dates, under a note that it is the founder’s own experience and not Enfav LLC contract past performance.',
  },
];
