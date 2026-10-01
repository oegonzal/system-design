import type { Metadata } from 'next';

/**
 * One route an app names: its path, its nav label and its page description.
 * A path may hold a dynamic segment in the app router's own spelling —
 * `/prompts/[promptId]` — which stands for any one segment.
 */
export interface NavItem {
  href: string;
  label: string;
  description: string;
}

/** What every page title of an app carries: `Prompts · <appName>`. */
export interface NavTableOptions {
  appName?: string;
}

/** Whether `pathname` is `href` or a route under it; the root is only ever itself. */
export const isUnder = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

const segmentsOf = (path: string): string[] => path.split('/').filter((part) => part.length > 0);

/** The app router's grammar for a segment that matches any value: `[promptId]`. */
const isDynamicSegment = (segment: string): boolean =>
  segment.startsWith('[') && segment.endsWith(']');

/**
 * How specifically `href` names `pathname`, or null when it does not name it
 * at all — it is neither the route nor one the pathname is under. More
 * segments matched is more specific, and among those a fixed segment beats a
 * dynamic one: `/prompts/new` is the route `/prompts/new` names before
 * `/prompts/[promptId]` and before `/prompts`. The root names only itself.
 */
function specificity(pathname: string, href: string): readonly [number, number] | null {
  const path = segmentsOf(pathname);
  const route = segmentsOf(href);
  if (route.length === 0) return path.length === 0 ? [0, 0] : null;
  if (route.length > path.length) return null;
  let fixed = 0;
  for (const [index, segment] of route.entries()) {
    if (isDynamicSegment(segment)) continue;
    if (segment !== path[index]) return null;
    fixed += 1;
  }
  return [route.length, fixed];
}

const moreSpecific = (a: readonly [number, number], b: readonly [number, number]): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];

/**
 * An app's routes as one table: the nav's items first, then the routes with
 * metadata but no nav entry. Every lookup reads the same rows, so a page's
 * title, its nav label and what a navigation announces can never disagree —
 * and a pathname always belongs to the most specific row that names it.
 * Given the app's name, every page title carries it, absolutely: the
 * dashboard at `/` sits in the root layout's own segment, where a layout's
 * title template never applies. Server-safe — no hooks — so a `page.tsx`
 * can export `pageMetadata(href)`.
 */
export function navTable(
  items: readonly NavItem[],
  extra: readonly NavItem[] = [],
  { appName }: NavTableOptions = {},
) {
  const rows = [...items, ...extra];
  const titled = (label: string): string => (appName ? `${label} · ${appName}` : label);
  return {
    /** The row a pathname belongs to: the most specific one naming it, the first on a tie. */
    navItemFor: (pathname: string): NavItem | null => {
      let best: { item: NavItem; rank: readonly [number, number] } | null = null;
      for (const item of rows) {
        const rank = specificity(pathname, item.href);
        if (rank !== null && (best === null || moreSpecific(rank, best.rank)))
          best = { item, rank };
      }
      return best?.item ?? null;
    },
    /** A route's `title` and `description`, or nothing for a route the table does not name. */
    pageMetadata: (href: string): Metadata => {
      const item = rows.find((candidate) => candidate.href === href);
      if (!item) return {};
      return {
        title: appName ? { absolute: titled(item.label) } : item.label,
        description: item.description,
      };
    },
    /** A document title in the table's own form — for a page that names itself once it has loaded. */
    titled,
  };
}
