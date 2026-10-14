import type { Criterion } from './criterion';

/** The Enfav LLC website (packages/website): a marketing site statically built with Astro. */
export const SITE_CRITERIA: readonly Criterion[] = [
  {
    id: 'SITE-1',
    statement:
      'Every page is statically generated: the site’s Astro config declares no adapter and no server output, so nothing is rendered on request.',
  },
  {
    id: 'SITE-4',
    statement:
      'A company fact that is not verified renders as a visible placeholder and never reaches the structured data, and no credential claim appears anywhere but through a verified fact.',
  },
];
