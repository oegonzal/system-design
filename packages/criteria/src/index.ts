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
  {
    id: 'UX-4',
    statement: 'Palette blocks are grouped into visible categories and filterable by name.',
  },
  {
    id: 'UX-5',
    statement: 'Components declare operations and responsibilities, and connections carry them.',
  },
  {
    id: 'UX-6',
    statement: 'A design narrative is authored alongside the diagram and submitted with it.',
  },
  {
    id: 'UX-7',
    statement: 'Every block kind teaches what it is for and when to use it in the UI.',
  },
  {
    id: 'UX-8',
    statement:
      'The narrative editor shows which prompt requirements the draft has not yet addressed.',
  },
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
  {
    id: 'EVAL-4',
    statement: 'Unmet expectations surface as teaching findings with ghost-fix suggestions.',
  },
  {
    id: 'EVAL-5',
    statement:
      'Scores are calibrated: an empty canvas fails, a naive design fails, and only demonstrated depth earns an A.',
  },
  {
    id: 'EVAL-6',
    statement: 'The LLM depth axis is displayed beside, and never alters, the deterministic score.',
  },
  {
    id: 'EVAL-7',
    statement:
      'Adversarial scenarios are selected deterministically and narrated as failure stories.',
  },
  {
    id: 'EVAL-8',
    statement: 'Every evaluation records the profile it was graded under and its evidence trail.',
  },
  {
    id: 'EVAL-9',
    statement:
      'The narrative is graded with the diagram for alignment: unexplained components become findings.',
  },
  {
    id: 'EVAL-10',
    statement:
      'A submitted narrative earns the communication dimension: components, flows, and requirements coverage graded deterministically.',
  },
  // STAR repository
  { id: 'STAR-1', statement: 'STAR stories support create, read, update and delete.' },
  { id: 'STAR-2', statement: 'Stories are searchable and filterable by tag.' },
  { id: 'STAR-3', statement: 'A story can link to a prompt and an experience.' },
] as const;

export const CRITERION_IDS = CRITERIA.map((criterion) => criterion.id);
