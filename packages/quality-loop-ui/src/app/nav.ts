import { navTable, type NavItem } from '@sysdesign/web-kit';

/**
 * The client's routes as one table. The nav bar maps over `NAV_ITEMS`, each
 * `page.tsx` exports `pageMetadata('/route')`, and the route announcer reads
 * the same rows — so a page's title, its nav label and what a navigation
 * announces can never disagree.
 */

export const APP_NAME = 'Quality loop';

export const NAV_ITEMS = [
  {
    href: '/',
    label: 'Run',
    description:
      'Pick a prompt, run a critic/evaluator/controller pipeline over it, and read the verdict.',
  },
  {
    href: '/inspect',
    label: 'Inspect',
    description:
      'The machinery under a run: what each lens answered, what survived agreement, how evidence became a number, and what changed between iterations.',
  },
] as const satisfies readonly NavItem[];

export const {
  navItemFor,
  pageMetadata,
  titled: pageTitle,
} = navTable(NAV_ITEMS, [], { appName: APP_NAME });
