/**
 * Who the site is and where it lives. `origin` is the one declaration of the
 * production URL: the pages and robots.txt build their full URLs from it
 * (canonical, og:url, og:image, the JSON-LD); astro.config.ts makes it Astro's
 * `site`, which the sitemap integration reads; and the deploy workflow reads it
 * for its environment URL and production checks. Plain TypeScript, so Node can
 * import it directly.
 */
export const SITE = {
  origin: 'https://enfav.com',
  name: 'Enfav LLC',
  description:
    'Agentic AI, workflow automation and software engineering for commercial and public-sector organizations.',
  /** What the company is, in the words the about page opens with. */
  summary:
    'Enfav LLC is an AI-focused software engineering company. We design and integrate AI-centered workflows that reduce repetitive manual steps and connect knowledge, people and existing applications.',
  locale: 'en_US',
} as const;

/** The line under the wordmark, as the capability statement heads itself. */
export const TAGLINE = 'AI workflow systems';

/** The site's primary action: the home page leads with it, and the closing call to action ends on it. */
export const PRIMARY_ACTION = { href: '/contact/', action: 'Start a conversation' } as const;

/** The call to action that closes the marketing pages. */
export const CLOSING_CTA = {
  title: 'Have a process worth automating?',
  text: 'Tell us what you are working on.',
  ...PRIMARY_ACTION,
} as const;

/** The primary navigation, in order. Every href is the URL its page answers 200 on. */
export const NAV = [
  { href: '/services/', label: 'Services' },
  { href: '/government/', label: 'Government' },
  { href: '/about/', label: 'About' },
  { href: '/contact/', label: 'Contact' },
] as const;
