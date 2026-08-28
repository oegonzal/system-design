/**
 * The product's completion criteria as a typed registry.
 *
 * Tests claim a criterion by putting its id in the title — `it('[EVAL-1] …')`,
 * `test('[UX-2] …')` — which is the one marker both Vitest and Playwright can
 * carry. A coverage spec (tooling) fails when any id below has no test, so a
 * requirement cannot silently lose its proof.
 */
export interface Criterion {
  id: string;
  /** What must be demonstrably true. */
  statement: string;
}

export const CRITERIA: readonly Criterion[] = [
  // Interactive design canvas
  { id: 'UX-1', statement: 'The palette offers every system-design node kind in the contract.' },
  { id: 'UX-2', statement: 'Nodes can be added, connected, edited and deleted on the canvas.' },
  { id: 'UX-3', statement: 'Edges distinguish sync from async communication.' },
  // Prompt generation from experience
  { id: 'GEN-1', statement: 'A design prompt can be generated from a seeded experience.' },
  {
    id: 'GEN-2',
    statement: 'The same experience, difficulty and seed produce an identical prompt.',
  },
  {
    id: 'GEN-3',
    statement: 'A prompt presents scenario, functional requirements, NFRs and scale targets.',
  },
  // Critic / eval pipeline
  { id: 'EVAL-1', statement: 'A submitted revision is graded with per-dimension scores.' },
  {
    id: 'EVAL-2',
    statement: 'Findings teach: each carries a message and points at affected elements.',
  },
  {
    id: 'EVAL-3',
    statement: 'An accepted suggestion, resubmitted, improves the overall score.',
  },
  // STAR repository
  { id: 'STAR-1', statement: 'STAR stories support create, read, update and delete.' },
  { id: 'STAR-2', statement: 'Stories are searchable and filterable by tag.' },
  { id: 'STAR-3', statement: 'A story can link to a prompt and an experience.' },
] as const;

export const CRITERION_IDS = CRITERIA.map((criterion) => criterion.id);
