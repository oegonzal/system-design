import type { Period } from '../lib/dates';

/** One of the founder's prior employers. */
interface Employment {
  readonly employer: string;
  readonly role: string;
  readonly period: Period;
  /** One line, for the capability statement's delivery evidence. */
  readonly summary: string;
  /** The About page's account of the role. */
  readonly highlights: readonly string[];
}

/** A system the founder built and continues at Enfav; not client work. */
interface FounderSystem {
  readonly title: string;
  readonly text: string;
}

interface Founder {
  readonly name: string;
  readonly title: string;
  readonly bio: readonly string[];
  /** Newest first, one employer per entry. */
  readonly experience: readonly Employment[];
  /** What every list of that experience says it is, wherever it appears. */
  readonly experienceNote: string;
  readonly education: string;
  readonly systems: readonly FounderSystem[];
  /** What every list of those systems says they are, wherever it appears. */
  readonly systemsNote: string;
}

/**
 * The founder, as the About page and the capability statement present them,
 * drawn from the résumé the owner approved for it and the owner's capability
 * statement. Each claim notes, in a comment, the résumé entry it rests on.
 * Every employer is named in its own entry; the pages head the list as the
 * founder's employment, never as Enfav LLC contract past performance. The bio restates three company
 * facts as copy: the legal name, the founder's name and the year the company
 * was organized (COMPANY.legalName, COMPANY.founder.name and COMPANY.organized),
 * so changing any of them means rewording it.
 */
export const FOUNDER: Founder = {
  name: 'Oscar Gonzalez',
  title: 'Founder & Chief Software Engineer',
  bio: [
    // Organized 2025-10-24 (the state filing); "Founded an AI-focused engineering company" (Enfav LLC, Jul 2026 – present).
    'Oscar founded Enfav LLC in 2025 to bring production-grade AI automation and software engineering to commercial and public-sector teams, and personally leads its engineering work.',
    // Full-stack roles Sep 2015 – Jul 2026, lead and senior ones from Jun 2017 (nine years).
    'Oscar has more than ten years as a full-stack engineer, nine of them in lead and senior roles, building production software for entertainment, advertising technology and live-event ticketing platforms.',
  ],
  experience: [
    // Madhive, Senior Software Engineer · Contract, Jan 2026 – Jul 2026.
    {
      employer: 'Madhive',
      role: 'Senior Software Engineer (contract)',
      period: { start: '2026-01', end: '2026-07' },
      summary:
        'Enterprise AdTech applications, and Playwright, Jest and Datadog test automation that cut production bugs 50% and manual QA 60%.',
      highlights: [
        'Developed enterprise AdTech applications with TypeScript, Angular and Node.js, including reusable components and dynamic widgets for complex advertising workflows.',
        'Drove AI-assisted Playwright end-to-end automation with Jest, Datadog and multimodal validation, cutting production bugs 50% and manual QA 60%.',
        'Improved CI/CD regression workflows and automated quality checks, using Datadog and application logs to investigate defects and improve production reliability.',
      ],
    },
    // Gala Games and Entertainment, Lead Software Engineer · Full-Time, Jun 2024 – Jan 2026.
    {
      employer: 'Gala Games & Entertainment',
      role: 'Lead Software Engineer',
      period: { start: '2024-06', end: '2026-01' },
      summary:
        'AI-enabled media metadata, GCP Vision, vector search and Sanity integrations, and cloud services supporting 10,000+ concurrent users.',
      highlights: [
        'Owned architecture, implementation, integrations and production delivery across consumer-facing entertainment applications.',
        'Integrated the GCP Vision API, vector search and Sanity CMS to automate film content operations, thumbnail preparation, image selection and release metadata.',
        'Architected Node.js and NestJS services on AWS and GCP with MongoDB, scaling media, collectibles and user-state workflows to 10,000+ concurrent users.',
      ],
    },
    // Frequence, Lead Software Engineer · Full-Time, Dec 2020 – Jun 2024.
    {
      employer: 'Frequence',
      role: 'Lead Software Engineer',
      period: { start: '2020-12', end: '2024-06' },
      summary:
        'Angular workflow frameworks and platform engineering, with technical direction for 30+ engineers and QA specialists.',
      highlights: [
        "Helped lead Frequence's Angular framework, architecting extensible widgets and configurable UI workflows for AdTech automation.",
        'Automated AI-assisted browser regression across high-variation customer paths, improving release confidence for production-critical workflows.',
        'Provided technical direction for 30+ engineers and QA specialists across architecture, testing strategy, design systems and code-review standards.',
      ],
    },
    // TicketSocket & IceCreamSocial, Lead Full Stack Developer · Full-Time, Jun 2017 – Dec 2020.
    {
      employer: 'TicketSocket & IceCreamSocial',
      role: 'Lead Full Stack Developer',
      period: { start: '2017-06', end: '2020-12' },
      summary:
        'React and TypeScript modernization, PostgreSQL and API integration, and AWS services scaled from 350 to 10,000+ concurrent users.',
      highlights: [
        'Migrated AngularJS to React and TypeScript, improving architecture, testability and design-system reuse.',
        'Re-architected AWS ticketing services, scaling from 350 to 10,000+ concurrent users.',
        'Optimized PostgreSQL data flows with indexing, stored procedures, triggers, webhooks and transactional event processing.',
        'Raised test coverage from near zero to 70% across a 90,000+ line codebase and created Redocly and Swagger API documentation for partner onboarding.',
      ],
    },
    // Visa, Full Stack Engineer · Full-Time, Jun 2016 – May 2017.
    {
      employer: 'Visa',
      role: 'Full Stack Engineer',
      period: { start: '2016-06', end: '2017-05' },
      summary:
        'Risk dashboards and vendor workflow applications, built full-stack with D3, Angular and Node.js.',
      highlights: [
        "Built Angular and D3.js risk dashboards with data-science teams to surface infrastructure exposure across Visa's network, reducing incidents 30%+.",
        'Developed a real-time Angular and Node.js vendor portal that cut third-party tool approval cycles 80%+.',
      ],
    },
  ],
  experienceNote:
    "The founder's own prior employment: evidence of technical experience, not Enfav LLC contract past performance.",
  education: 'B.S. Computer Science, University of California San Diego, 2016',
  systemsNote: 'Built by the founder since 2025 and continued at Enfav; not client work.',
  systems: [
    // Personal project "Agentic Engine", Jun 2025 – present.
    {
      title: 'Multi-agent workflow engine',
      text: 'Goal-to-DAG task planning, tool calling and MCP, strict schemas, language-model critics and evaluations, contextual memory and retrieval.',
    },
    // Enfav LLC: "Built RAG systems with vector embeddings, semantic and hybrid search, reranking, and contextual grounding".
    {
      title: 'RAG and search pipelines',
      text: 'Vector embeddings, semantic and hybrid retrieval, reranking and contextual grounding for searchable document and data workflows.',
    },
    // Personal project "System Design Graph", May 2026 – present.
    {
      title: 'AI architecture evaluator',
      text: 'Graph-based system-design components with critic and evaluation pipelines for iterative architecture review.',
    },
    // Personal project "Browser-Session Automation", Jan 2026 – present.
    {
      title: 'Agentic browser automation',
      text: 'Playwright-based multi-step browser sessions, UI validation and tool-integrated test workflows.',
    },
  ],
};
