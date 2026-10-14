/**
 * Who the site is and where it lives. `origin` is the one declaration of the
 * production URL: astro.config.ts makes it Astro's `site` (canonical URLs, the
 * sitemap, robots.txt), and the deploy workflow reads it for its environment URL
 * and production checks. Plain TypeScript, so Node can import it directly.
 */
export const SITE = {
  origin: 'https://enfav.com',
  name: 'Enfav LLC',
  description:
    'AI workflow automation and software engineering for commercial and public-sector organizations.',
  locale: 'en_US',
} as const;

/** The primary navigation, in order. Every href is the URL its page answers 200 on. */
export const NAV = [
  { href: '/services/', label: 'Services' },
  { href: '/government/', label: 'Government' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
] as const;
