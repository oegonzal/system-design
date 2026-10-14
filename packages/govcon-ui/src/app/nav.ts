import { navTable, type NavItem } from '@sysdesign/web-kit';

/**
 * The navigation vocabulary and per-route metadata, in one place. The nav
 * bar maps over `NAV_ITEMS`; each `page.tsx` exports `pageMetadata('/route')`
 * so titles and the nav can never disagree, and every title — the
 * dashboard's at `/` included — carries the app's name in one form,
 * `pageTitle`.
 */

export const APP_NAME = 'Govcon';

export const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    description: 'The budget, a pull, what is due and what is new.',
  },
  {
    href: '/search',
    label: 'Search',
    description: 'Rank the store over your filters, or search SAM.gov and save the search.',
  },
  { href: '/pipeline', label: 'Pipeline', description: 'The notices you are tracking, by stage.' },
  {
    href: '/intel',
    label: 'Intel',
    description: 'Awards and registrants: who won what, for how much, against how many.',
  },
  {
    href: '/spending',
    label: 'Spending',
    description:
      'What agencies obligate and when, where it goes, what is expiring, and an agency’s budget by fiscal year.',
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Profiles, weights and prices; the sources and the ledger.',
  },
] as const satisfies readonly NavItem[];

/** Routes with metadata but no nav entry. */
const EXTRA_PAGES: readonly NavItem[] = [
  {
    href: '/notices',
    label: 'Notice',
    description: 'One notice: the facts, the score, the attachments, the awards and its bid.',
  },
  {
    href: '/awards',
    label: 'Award',
    description:
      'One award: who holds it, what it can reach, when it ends with and without options, how it was bought, and who works under it.',
  },
  {
    href: '/primes',
    label: 'Firm',
    description:
      'One firm: its registration, the awards it holds that are ending, who buys from it, and who it hires and is hired by.',
  },
];

export const {
  navItemFor,
  pageMetadata,
  titled: pageTitle,
} = navTable(NAV_ITEMS, EXTRA_PAGES, { appName: APP_NAME });
