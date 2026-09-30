import type { Metadata } from 'next';

/** One route an app names: its path, its nav label and its page description. */
export interface NavItem {
  href: string;
  label: string;
  description: string;
}

/** Whether `pathname` is `href` or a route under it; the root is only ever itself. */
export const isUnder = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * An app's routes as one table: the nav's items first, then the routes with
 * metadata but no nav entry. Both lookups read the same rows, so a page's
 * title, its nav label and what a navigation announces can never disagree.
 * Server-safe — no hooks — so a `page.tsx` can export `pageMetadata(href)`.
 */
export function navTable(items: readonly NavItem[], extra: readonly NavItem[] = []) {
  const rows = [...items, ...extra];
  return {
    /** The row a pathname belongs to — its own route, or a route it is under. */
    navItemFor: (pathname: string): NavItem | null =>
      rows.find((item) => isUnder(pathname, item.href)) ?? null,
    /** A route's `title` and `description`, or nothing for a route the table does not name. */
    pageMetadata: (href: string): Metadata => {
      const item = rows.find((candidate) => candidate.href === href);
      return item ? { title: item.label, description: item.description } : {};
    },
  };
}
