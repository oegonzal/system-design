import type { Metadata } from 'next';

/**
 * The navigation vocabulary and per-route metadata, in one place. The nav
 * bar maps over `NAV_ITEMS`; each `page.tsx` exports `pageMetadata('/route')`
 * so titles and the nav can never disagree.
 */
export interface NavItem {
  href: string;
  label: string;
  description: string;
}

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
export const EXTRA_PAGES: readonly NavItem[] = [
  {
    href: '/notices',
    label: 'Notice',
    description: 'One notice: the facts, the score, the attachments, the awards and its bid.',
  },
];

export function pageMetadata(href: string): Metadata {
  const item = [...NAV_ITEMS, ...EXTRA_PAGES].find((candidate) => candidate.href === href);
  if (!item) return {};
  return { title: item.label, description: item.description };
}

/** The nav item a pathname belongs to — its own route, or a route it is under. */
export function navItemFor(pathname: string): NavItem | null {
  return (
    [...NAV_ITEMS, ...EXTRA_PAGES].find((item) =>
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? null
  );
}
