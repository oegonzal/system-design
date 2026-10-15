/** The ways to engage, by key: each service names the one that fits it first. */
type EngagementId = 'prototype' | 'knowledge-pipeline' | 'modernization' | 'qa-sprint';

/** One line of work Enfav offers. */
export interface Service {
  /** The anchor on /services/ and the key cards link to. */
  readonly id: string;
  /** The engagement that fits this line first. */
  readonly engagement: EngagementId;
  readonly title: string;
  /** One sentence for the home cards and the capability statement's service lines. */
  readonly line: string;
  /** The full description on /services/. */
  readonly summary: string;
  readonly deliverables: readonly string[];
}

/**
 * The service lines, in the order every page lists them, as the capability
 * statement does. Offerings, never past results.
 */
export const SERVICES: readonly Service[] = [
  {
    id: 'agentic-workflow-engineering',
    engagement: 'prototype',
    title: 'Agentic workflow engineering',
    line: 'Multi-agent and tool-enabled orchestration with typed contracts, evaluations and human review.',
    summary:
      'Multi-agent and tool-enabled orchestration that automates multi-step technical and business processes: task planning and DAGs, MCP and API actions, typed JSON contracts, retries, evaluations and human review, so decisions can be traced.',
    deliverables: [
      'Workflow design, task planning and DAG orchestration',
      'MCP and API tool integrations for agents',
      'Typed JSON contracts, retries and failure handling',
      'Evaluation harnesses, human review steps and audit trails',
    ],
  },
  {
    id: 'document-intelligence-and-rag',
    engagement: 'knowledge-pipeline',
    title: 'Document intelligence and RAG',
    line: 'Document extraction, classification and validation, with grounded retrieval-augmented answers.',
    summary:
      'Extraction and enrichment workflows, document classification and validation, and retrieval over your documents and records — embeddings, hybrid search, reranking and grounded answers — with retrieval quality measured.',
    deliverables: [
      'Document ingestion, extraction and enrichment pipelines',
      'Classification and validation against your rules',
      'Vector and hybrid search with reranking',
      'Grounded answers with source references, and retrieval evaluation',
    ],
  },
  {
    id: 'systems-and-data-integration',
    engagement: 'modernization',
    title: 'Systems and data integration',
    line: 'Custom APIs and backends, event processing, data pipelines and internal web tools on AWS and GCP.',
    summary:
      'Custom APIs and backends, workflow modernization, event processing, PostgreSQL and MongoDB pipelines, AWS and GCP services and internal web tools — typed, modular and observable.',
    deliverables: [
      'APIs, backend services and data synchronizers',
      'Event processing and PostgreSQL and MongoDB pipelines',
      'Incremental modernization of legacy services and front ends',
      'Internal web tools and dashboards',
    ],
  },
  {
    id: 'ai-assisted-qa-and-browser-automation',
    engagement: 'qa-sprint',
    title: 'AI-assisted QA and browser automation',
    line: 'Playwright and MCP browser automation, regression harnesses and CI/CD quality gates.',
    summary:
      'Playwright and MCP browser sessions, regression harnesses, CI/CD validations, structured evaluations, debugging and observability for release quality.',
    deliverables: [
      'End-to-end and regression test automation',
      'Agentic browser sessions with Playwright and MCP',
      'CI/CD validations and release checks',
      'Debugging and observability with logs, metrics and traces',
    ],
  },
];

/** A bounded unit of work a buyer can scope and contract for. */
export interface Engagement {
  readonly id: EngagementId;
  readonly title: string;
  readonly text: string;
}

/** The ways to engage, on every page that offers them, in the capability statement's order. */
export const ENGAGEMENTS: readonly Engagement[] = [
  {
    id: 'prototype',
    title: '2–4 week AI prototype',
    text: 'A narrow workflow demonstrated against measurable success criteria, on approved data, with handoff documentation.',
  },
  {
    id: 'knowledge-pipeline',
    title: 'Document and knowledge pipeline',
    text: 'Sources connected, governed ingestion and retrieval built, and checks and human review added.',
  },
  {
    id: 'modernization',
    title: 'Modernization component',
    text: 'An API, data synchronizer, service migration or case-processing module, delivered within an existing platform.',
  },
  {
    id: 'qa-sprint',
    title: 'QA automation sprint',
    text: 'Critical paths automated, with regression evidence integrated into your existing CI/CD.',
  },
];

/** The engagement a service names as its fit. */
export const engagementOf = (service: Service): Engagement => {
  const engagement = ENGAGEMENTS.find(({ id }) => id === service.engagement);
  if (engagement === undefined)
    throw new Error(`No engagement "${service.engagement}" is declared.`);
  return engagement;
};

/** The technology the services are built with, by area. */
interface TechnologyArea {
  readonly area: string;
  readonly items: readonly string[];
}

/** On /services/ and in the capability statement. */
export const TECHNOLOGY: readonly TechnologyArea[] = [
  {
    area: 'AI and orchestration',
    items: [
      'LLMs',
      'RAG',
      'embeddings',
      'reranking',
      'MCP',
      'workflow DAGs',
      'evaluation harnesses',
    ],
  },
  { area: 'Software', items: ['TypeScript', 'Node.js', 'NestJS', 'Python', 'React', 'Next.js'] },
  {
    area: 'Platform and quality',
    items: [
      'AWS',
      'GCP',
      'PostgreSQL',
      'MongoDB',
      'Redis',
      'Kafka',
      'Playwright',
      'Jest',
      'Datadog',
      'CI/CD',
    ],
  },
];
