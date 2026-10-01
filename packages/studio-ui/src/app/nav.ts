import { navTable, type NavItem } from '@sysdesign/web-kit';

/**
 * The navigation vocabulary and per-route metadata, in one place. The nav
 * bar maps over `NAV_ITEMS`; each `page.tsx` exports
 * `pageMetadata('/route')` so titles and the nav can never disagree, and
 * every title — the dashboard's at `/` and the not-found page's included —
 * carries the app's name in one form, `pageTitle`.
 */

export const APP_NAME = 'System Design Studio';

export const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    description: 'Your experiences, a prompt written from any of them, and your practice sessions.',
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

/**
 * Routes with metadata but no nav entry. A dynamic segment is spelled as
 * the app router spells it, so a detail page is named by its own row.
 */
const EXTRA_PAGES: readonly NavItem[] = [
  {
    href: '/prompts/new',
    label: 'New prompt',
    description: 'Write a prompt as markdown, or import one from the library.',
  },
  {
    href: '/prompts/[promptId]',
    label: 'Prompt',
    description: 'The markdown and the derived criteria of one design prompt.',
  },
  {
    href: '/practice/[sessionId]',
    label: 'Practice',
    description: 'Design on the canvas and submit revisions for grading.',
  },
  {
    href: '/stories/new',
    label: 'New STAR story',
    description: 'Capture a new interview story.',
  },
  {
    href: '/stories/[storyId]',
    label: 'STAR story',
    description: 'Edit one interview story.',
  },
];

export const {
  navItemFor,
  pageMetadata,
  titled: pageTitle,
} = navTable(NAV_ITEMS, EXTRA_PAGES, { appName: APP_NAME });
