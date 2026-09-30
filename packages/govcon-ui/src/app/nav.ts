import { navTable, type NavItem } from '@sysdesign/web-kit';

/**
 * The navigation vocabulary and per-route metadata, in one place. The nav
 * bar maps over `NAV_ITEMS`; each `page.tsx` exports `pageMetadata('/route')`
 * so titles and the nav can never disagree.
 */
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
];

export const { navItemFor, pageMetadata } = navTable(NAV_ITEMS, EXTRA_PAGES);
