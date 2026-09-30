import { navTable, type NavItem } from '@sysdesign/web-kit';

/**
 * The navigation vocabulary and per-route metadata, in one place. The nav
 * bar maps over `NAV_ITEMS`; each `page.tsx` exports
 * `pageMetadata('/route')` so titles and the nav can never disagree.
 */

export const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    description: 'Your experiences, recent practice sessions and shortcuts.',
  },
  {
    href: '/prompts',
    label: 'Prompts',
    description: 'Write, import, generate and browse system-design prompts.',
  },
  {
    href: '/stories',
    label: 'STAR stories',
    description: 'Interview-ready stories about past production work.',
  },
  {
    href: '/settings',
    label: 'Appearance',
    description: 'Color mode, accent and motion preferences.',
  },
] as const satisfies readonly NavItem[];

/** Routes with metadata but no nav entry. */
const EXTRA_PAGES: readonly NavItem[] = [
  {
    href: '/prompts/new',
    label: 'New prompt',
    description: 'Write a prompt as markdown, or import one from the library.',
  },
  {
    href: '/practice',
    label: 'Practice',
    description: 'Design on the canvas and submit revisions for grading.',
  },
  {
    href: '/stories/new',
    label: 'New STAR story',
    description: 'Capture a new interview story.',
  },
];

export const { navItemFor, pageMetadata } = navTable(NAV_ITEMS, EXTRA_PAGES);
