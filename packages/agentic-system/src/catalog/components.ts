/**
 * The components themselves — the stack a memory architecture is drawn from.
 * `satisfies readonly CatalogComponent[]` holds every entry to the catalog
 * shape, and each store declares the memory types it serves.
 */
import type { CatalogComponent, CrossCuttingControl } from './catalog';

export const MEMORY_COMPONENTS = [
  {
    id: 'nextjs',
    label: 'Next.js',
    layer: 'frontend',
    apiInterface:
      'A React app over the backend’s REST/RPC; renders dashboards and human-approval surfaces.',
    contributes: 'Where a person reads what the agents did and approves consequential actions.',
    operations: [
      { name: 'viewDashboard', kind: 'query', notes: 'Read the state the agents expose.' },
      {
        name: 'approveAction',
        kind: 'command',
        idempotent: true,
        notes: 'A human decision the workflow waits on.',
      },
    ],
    alternatives: ['vue'],
  },
  {
    id: 'nestjs',
    label: 'NestJS API',
    layer: 'backend',
    apiInterface:
      'Typed controllers with Zod-validated DTOs; the one place that owns consequential writes.',
    contributes:
      'The application boundary: validates input, enforces policy, and starts agent work.',
    operations: [
      { name: 'startTask', kind: 'command', notes: 'Kick an agent workflow.' },
      { name: 'readState', kind: 'query', notes: 'Serve business and execution state to the UI.' },
    ],
    alternatives: ['fastify'],
  },
  {
    id: 'langgraph',
    label: 'LangGraph',
    layer: 'orchestration',
    apiInterface:
      'A persisted state graph with checkpoints; nodes are steps, edges are transitions.',
    contributes: 'Durable long-running orchestration with retries and resumable checkpoints.',
    operations: [
      { name: 'advanceStep', kind: 'command', notes: 'Run the next node and checkpoint.' },
      { name: 'checkpoint', kind: 'event', notes: 'Execution state persisted after each step.' },
    ],
    alternatives: ['temporal', 'mastra'],
  },
  {
    id: 'temporal',
    label: 'Temporal',
    layer: 'orchestration',
    apiInterface:
      'Workflows and activities with durable timers; history replay reconstructs state.',
    contributes:
      'Execution state and scheduling for work that outlives a request — the durable backbone.',
    operations: [
      { name: 'runWorkflow', kind: 'command', notes: 'Start or signal a durable workflow.' },
      { name: 'scheduleFollowUp', kind: 'event', notes: 'A timer fires a later step.' },
    ],
    alternatives: ['langgraph', 'bullmq'],
  },
  {
    id: 'mastra',
    label: 'Mastra / OpenAI Agents SDK',
    layer: 'agent-runtime',
    apiInterface:
      'An agent runtime: structured outputs, tool calling, and typed handoffs between agents.',
    contributes:
      'Reasoning, planning and tool use — the agents that produce artifacts the loop grades.',
    operations: [
      { name: 'planTask', kind: 'command', notes: 'Decompose a goal into tool calls.' },
      { name: 'callTool', kind: 'command', notes: 'Invoke a typed tool and consume its result.' },
    ],
    alternatives: ['langgraph'],
  },
  {
    id: 'custom-memory-service',
    label: 'Memory service (custom)',
    layer: 'memory-service',
    apiInterface:
      'remember / recall(query, scope) / update / invalidate / consolidate — provider-independent.',
    contributes:
      'The write/update pipeline and hybrid retrieval over the stores; owns what is remembered.',
    operations: [
      {
        name: 'remember',
        kind: 'command',
        notes: 'Extract, dedupe, reconcile and persist a durable memory.',
      },
      {
        name: 'recall',
        kind: 'query',
        notes: 'Hybrid, reranked, scoped retrieval under a token budget.',
      },
      {
        name: 'invalidate',
        kind: 'command',
        idempotent: true,
        notes: 'Supersede or expire a stale memory.',
      },
    ],
    memoryTypes: ['working', 'episodic', 'semantic', 'procedural', 'relational'],
    alternatives: ['mem0', 'zep'],
  },
  {
    id: 'mem0',
    label: 'Mem0',
    layer: 'memory-service',
    apiInterface:
      'Managed memory API: fact extraction, dedupe, contextual search, explicit updates.',
    contributes: 'A hosted memory service when a custom one is not yet worth building.',
    operations: [
      { name: 'addMemory', kind: 'command', notes: 'Hand text for extraction and storage.' },
      { name: 'searchMemory', kind: 'query', notes: 'Retrieve cross-session memories by meaning.' },
    ],
    memoryTypes: ['working', 'episodic', 'semantic', 'procedural', 'relational'],
    alternatives: ['custom-memory-service', 'zep'],
  },
  {
    id: 'zep',
    label: 'Zep',
    layer: 'memory-service',
    apiInterface: 'Temporal-graph memory: time-aware entity relationships and fact invalidation.',
    contributes: 'Evolving facts and relationships over time, with when-it-was-true preserved.',
    operations: [
      {
        name: 'addEpisode',
        kind: 'command',
        notes: 'Record an interaction into the temporal graph.',
      },
      {
        name: 'searchFacts',
        kind: 'query',
        notes: 'Retrieve current or historical facts about entities.',
      },
    ],
    memoryTypes: ['episodic', 'relational'],
    alternatives: ['custom-memory-service', 'neo4j'],
  },
  {
    id: 'postgres',
    label: 'PostgreSQL',
    layer: 'structured-state',
    apiInterface:
      'Transactional SQL; the authoritative store for business state, versions and checkpoints.',
    contributes:
      'The source of truth — atomic facts, CRM rows, workflow state; the vector index is derived from it.',
    operations: [
      {
        name: 'writeFact',
        kind: 'command',
        notes: 'Insert or update an atomic fact with subject/predicate/validity.',
      },
      {
        name: 'lookupFact',
        kind: 'query',
        notes: 'Exact lookup by key, not approximate similarity.',
      },
    ],
    memoryTypes: ['semantic', 'relational', 'episodic'],
  },
  {
    id: 'pgvector',
    label: 'pgvector',
    layer: 'vector-search',
    apiInterface:
      'Vector columns beside relational rows in Postgres; filter on metadata in the same query.',
    contributes:
      'Semantic retrieval colocated with structured state — the first vector store to reach for.',
    operations: [
      {
        name: 'upsertEmbedding',
        kind: 'command',
        idempotent: true,
        notes: 'One embedding per chunk per model version.',
      },
      {
        name: 'similaritySearch',
        kind: 'query',
        notes: 'ANN search with metadata filters applied.',
      },
    ],
    memoryTypes: ['semantic', 'procedural'],
    alternatives: ['qdrant'],
  },
  {
    id: 'qdrant',
    label: 'Qdrant',
    layer: 'vector-search',
    apiInterface:
      'Named vectors, payload indexes and payload-based partitioning; dense and sparse retrieval.',
    contributes:
      'Specialised retrieval at scale — named registers per memory type, tenant payload isolation.',
    operations: [
      {
        name: 'upsertPoints',
        kind: 'command',
        idempotent: true,
        notes: 'Points with named vectors and an indexed payload.',
      },
      { name: 'searchPoints', kind: 'query', notes: 'Filtered ANN over a chosen named vector.' },
    ],
    memoryTypes: ['semantic', 'procedural'],
    alternatives: ['pgvector', 'pinecone', 'weaviate'],
  },
  {
    id: 'neo4j',
    label: 'Neo4j / Graphiti',
    layer: 'knowledge-graph',
    apiInterface: 'A property graph queried in Cypher; entities and the relationships among them.',
    contributes:
      'Relational memory — how contacts, contracts and decisions connect — added only when justified.',
    operations: [
      {
        name: 'relateEntities',
        kind: 'command',
        notes: 'Record an edge between two entities with validity.',
      },
      {
        name: 'traverse',
        kind: 'query',
        notes: 'Walk relationships to answer a connected question.',
      },
    ],
    memoryTypes: ['relational'],
    alternatives: ['zep'],
  },
  {
    id: 's3',
    label: 'S3 / Cloudflare R2',
    layer: 'object-store',
    apiInterface:
      'Durable blob storage by key; source documents land here before they are chunked and indexed.',
    contributes:
      'Retrieved-knowledge source of truth — the raw documents the vector index is built from.',
    operations: [
      {
        name: 'putObject',
        kind: 'command',
        idempotent: true,
        notes: 'Store a source document or rendition.',
      },
      { name: 'getObject', kind: 'query', notes: 'Fetch a document for chunking or citation.' },
    ],
    memoryTypes: ['episodic'],
    alternatives: ['gcs'],
  },
  {
    id: 'redis-cache',
    label: 'Redis (cache)',
    layer: 'cache',
    apiInterface:
      'In-memory key/value with TTLs; short-lived working state and hot recall results.',
    contributes:
      'Working-memory scratchpad and a cache in front of recall — never the system of record.',
    operations: [
      {
        name: 'cacheRecall',
        kind: 'command',
        idempotent: true,
        notes: 'Memoise a recall result under a TTL.',
      },
      { name: 'readWorking', kind: 'query', notes: 'Read the current task’s working state.' },
    ],
    memoryTypes: ['working'],
  },
  {
    id: 'redis-ratelimit',
    label: 'Redis (rate limits)',
    layer: 'cache',
    apiInterface:
      'Atomic counters with expiry; token-bucket limits for embedding and model providers.',
    contributes:
      'Keeps the write pipeline within provider rate limits — one embedding call per chunk per version.',
    operations: [
      {
        name: 'takeToken',
        kind: 'command',
        notes: 'Consume from a rate-limit bucket before a provider call.',
      },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP tools',
    layer: 'tool-integration',
    apiInterface:
      'Typed tool servers over the Model Context Protocol; native TypeScript APIs behind one contract.',
    contributes:
      'How agents reach the outside world safely — each tool a declared, typed contract.',
    operations: [
      {
        name: 'invokeTool',
        kind: 'command',
        notes: 'Call a tool with a validated argument shape.',
      },
    ],
  },
  {
    id: 'playwright',
    label: 'Playwright',
    layer: 'browser-automation',
    apiInterface: 'A driven browser session; pages, selectors and actions behind a tool contract.',
    contributes:
      'Browser automation when a task has no API — isolated behind timeouts and a breaker.',
    operations: [
      {
        name: 'runBrowserStep',
        kind: 'command',
        notes: 'Execute one planned browser action and read the result.',
      },
    ],
  },
  {
    id: 'langfuse',
    label: 'Langfuse',
    layer: 'observability',
    apiInterface: 'Trace and evaluation capture over the agent workflow; dashboards and scores.',
    contributes:
      'Observability and evaluation of agent/memory quality — retrieval shown, not just final answers.',
    operations: [
      {
        name: 'recordTrace',
        kind: 'event',
        notes: 'A workflow step and its retrieval emitted for review.',
      },
    ],
    alternatives: ['langsmith'],
  },
  {
    id: 'otel',
    label: 'OpenTelemetry',
    layer: 'observability',
    apiInterface: 'Spans across every hop; one request’s path through agents, tools and stores.',
    contributes: 'Follows a recall or a write across hops, so a slow or failing step is visible.',
    operations: [
      {
        name: 'span',
        kind: 'stream',
        notes: 'A continuous trace of one request across components.',
      },
    ],
  },
  {
    id: 'bullmq',
    label: 'BullMQ',
    layer: 'background-jobs',
    apiInterface:
      'A Redis-backed job queue; producers enqueue, workers drain with retries and a dead-letter.',
    contributes:
      'Simple background work — ingestion and consolidation off the request path — when Temporal is overkill.',
    operations: [
      { name: 'enqueueJob', kind: 'command', notes: 'Buffer ingestion or consolidation work.' },
      {
        name: 'drainJob',
        kind: 'command',
        idempotent: true,
        notes: 'A worker processes a job, safe to replay.',
      },
    ],
    alternatives: ['temporal'],
  },
] as const satisfies readonly CatalogComponent[];

/** The controls that touch every component but are drawn as none — advisory in a design. */
export const CROSS_CUTTING = [
  {
    id: 'zod',
    label: 'Zod',
    concern: 'validation',
    contributes:
      'Every boundary validates its input and structured LLM output against a schema before it is trusted.',
  },
  {
    id: 'permissions',
    label: 'Permissions & tenancy',
    concern: 'security',
    contributes:
      'Retrieval is tenant-scoped and server-enforced; retrieved memory is data, never a higher-priority instruction.',
  },
  {
    id: 'cost-controls',
    label: 'Cost controls',
    concern: 'cost',
    contributes:
      'Embedding and model spend is bounded — shared embeddings per version, budgets per task.',
  },
] as const satisfies readonly CrossCuttingControl[];
