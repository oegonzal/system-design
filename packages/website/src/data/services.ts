/** One line of work Enfav offers. */
export interface Service {
  /** The anchor on /services/ and the key cards link to. */
  readonly id: string;
  readonly title: string;
  /** One sentence for the home cards and the capability statement's core competencies. */
  readonly line: string;
  /** The full description on /services/. */
  readonly summary: string;
  readonly deliverables: readonly string[];
}

/** The services, in the order every page lists them. Offerings, never past results. */
export const SERVICES: readonly Service[] = [
  {
    id: 'ai-workflow-automation',
    title: 'AI workflow automation',
    line: 'Agentic workflows built on language models, tool calling and API orchestration, with critics and evaluators.',
    summary:
      'Agentic workflows that combine language models, tool calling, API orchestration and contextual memory to automate multi-step technical and business processes, with automated critics, evaluators and human checkpoints so every decision can be traced.',
    deliverables: [
      'Workflow design and orchestration',
      'Tool and API integrations for agents',
      'Evaluation harnesses: critics, rubrics and regression datasets',
      'Human review steps, audit trails and cost controls',
    ],
  },
  {
    id: 'retrieval-and-data-processing',
    title: 'Retrieval and data processing',
    line: 'Retrieval-augmented generation and data pipelines: embeddings, hybrid search, reranking and grounding.',
    summary:
      'Retrieval-augmented generation and data pipelines: embeddings, semantic and hybrid search, reranking and contextual grounding over your documents and records.',
    deliverables: [
      'Document ingestion, chunking and extraction pipelines',
      'Vector and hybrid search with reranking',
      'Grounded answers with source references',
      'Retrieval quality measurement',
    ],
  },
  {
    id: 'custom-software-engineering',
    title: 'Custom software engineering',
    line: 'Web applications and backend services in TypeScript, React, Node.js and PostgreSQL.',
    summary:
      'Modular web applications and backend services in TypeScript, Node.js, React, Next.js and PostgreSQL, built for reliability and extensibility.',
    deliverables: [
      'Web applications and dashboards',
      'APIs and backend services',
      'Reusable component libraries and design systems',
      'Automated tests and CI/CD pipelines',
    ],
  },
  {
    id: 'cloud-architecture-and-modernization',
    title: 'Cloud architecture and modernization',
    line: 'Architecture on AWS and GCP, event-driven services and incremental modernization.',
    summary:
      'Architecture for scale and reliability on AWS and GCP, event-driven services, and incremental modernization of legacy front ends and services.',
    deliverables: [
      'Architecture reviews and target designs',
      'Incremental migration of legacy applications',
      'Scalability and performance engineering',
      'Containerized services with logs, metrics and traces',
    ],
  },
  {
    id: 'systems-integration-and-quality-engineering',
    title: 'Systems integration and quality engineering',
    line: 'Platform and developer-tool integrations, end-to-end test automation and CI quality gates.',
    summary:
      'Integrations between your platforms and developer tools — GitHub, Jira, Playwright and MCP — and end-to-end test automation that makes releases predictable.',
    deliverables: [
      'API and webhook integrations',
      'Developer-workflow automation',
      'End-to-end and regression test automation',
      'CI quality gates and release checks',
    ],
  },
];
