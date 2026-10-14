/**
 * The About page's founder section, drawn from the résumé the owner approved
 * for it. Each claim notes the résumé line it rests on — by role and
 * dates, never by employer, because this repository is public. Prior experience
 * is the founder's own; the page heads it as such and never as Enfav LLC
 * contract past performance. The bio restates three company facts as copy: the
 * legal name, the founder's name and the founding year (COMPANY.legalName,
 * COMPANY.founder.name and COMPANY.founded), so changing or demoting any of
 * them means rewording it.
 */
export const FOUNDER = {
  name: 'Oscar Gonzalez',
  title: 'Founder & Chief Software Engineer',
  bio: [
    // Enfav LLC, Chief Software Engineer, Jul 2026 – present: "Founded an AI-focused engineering company".
    'Oscar founded Enfav LLC in 2026 to bring production-grade AI automation and software engineering to commercial and public-sector teams, and personally leads its engineering work.',
    // Lead and senior roles Jun 2017 – Jul 2026 (nine years); earlier full-stack roles from Sep 2015.
    'Before Enfav, Oscar spent more than ten years as a full-stack engineer: the last nine in lead and senior roles, building production software in media and entertainment, advertising technology and live-event ticketing, and before them, risk dashboards and a vendor portal at a global payments network.',
  ],
  priorExperience: [
    // Lead Full Stack Developer, Jun 2017 – Dec 2020.
    'Re-architected AWS ticketing services, scaling from 350 to 10,000+ concurrent users.',
    // Lead Software Engineer, Jun 2024 – Jan 2026.
    'Architected Node.js and NestJS services on AWS and GCP that scaled media, collectibles and user-state workflows to 10,000+ concurrent users.',
    // Senior Software Engineer (contract), Jan 2026 – Jul 2026.
    'Drove AI-assisted end-to-end test automation with Playwright, Jest and Datadog that cut production bugs 50% and manual QA 60%.',
    // Lead Software Engineer, Dec 2020 – Jun 2024.
    'Provided technical direction for 30+ engineers and QA specialists across architecture, testing strategy, design systems and code-review standards.',
    // Lead Full Stack Developer, Jun 2017 – Dec 2020.
    'Raised test coverage from near zero to 70% across a 90,000+ line codebase and published API documentation for partner onboarding.',
    // Full Stack Engineer, Jun 2016 – May 2017.
    'Built risk dashboards with data-science teams that surfaced infrastructure exposure across a global payments network and reduced incidents 30%+.',
  ],
  education: 'B.S. Computer Science, University of California San Diego, 2016',
  projects: [
    // Personal projects: Jun 2025 – present.
    'A workflow engine that compiles goals into task graphs checked by language-model critics and evaluators against strict schemas.',
    // May 2026 – present.
    'Graph-based system-design tooling with AI critique of scalability and architectural trade-offs.',
    // Jan 2026 – present.
    'Playwright browser automation driven by agentic workflows.',
  ],
} as const;
