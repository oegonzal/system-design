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
    statement:
      'A design brief — requirement bindings and traced flows — is authored alongside the diagram and submitted with it.',
  },
  {
    id: 'UX-7',
    statement: 'Every block kind teaches what it is for and when to use it in the UI.',
  },
  {
    id: 'UX-8',
    statement:
      'The walkthrough is authored as reference-anchored slots — an overview, a rationale per component, a narration per requirement — and each slot shows the same graded verdict the engine will read.',
  },
  {
    id: 'UX-9',
    statement:
      'Suggested bindings are proposals the author accepts or dismisses one at a time; an unaccepted proposal is never submitted, and each shows the same corroboration verdict the grade will use.',
  },
  {
    id: 'UX-10',
    statement:
      'A run exports in one click as a single zip — the diagram as a PDF plus prompt, narrative, brief, feedback and revisions each as its own Markdown file — so a design survives outside the database.',
  },
  {
    id: 'UX-11',
    statement:
      'A stuck author can hand the design to the AI coach: the coach tab streams the run’s trajectory live while it works, the improved design loads back from the timeline, and every machine-made revision is marked with its assistant origin. Without a live model the control explains itself instead of failing.',
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
  {
    id: 'GEN-4',
    statement:
      'Successive generated prompts vary: a fresh seed is drawn per generation and redrawn while its framing echoes a recent prompt, and generating without an experience rotates to the least-practiced one — so practice covers every archetype instead of repeating the same prompt.',
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
      'A component that no traced flow and no corroborated binding accounts for becomes a finding.',
  },
  {
    id: 'EVAL-10',
    statement:
      'A submitted brief earns the explanation dimension by corroboration: each claim is checked against the diagram the author drew.',
  },
  {
    id: 'EVAL-11',
    statement:
      'A design submitted without a brief — or with one that names more components than hold a claim — is graded on that, never excused from the explanation dimension.',
  },
  {
    id: 'EVAL-12',
    statement:
      'A claim the diagram cannot back up is caught deterministically and costs more than making no claim at all.',
  },
  {
    id: 'EVAL-13',
    statement:
      'Every evaluation writes a run dump: its inputs, every LLM prompt and response, the scoring arithmetic, and the result — on the failure path too.',
  },
  {
    id: 'EVAL-14',
    statement:
      'An improvement run raises the score monotonically: every accepted iteration persists as an assistant-origin revision graded strictly higher than the one before, and rejected candidates are never persisted as revisions.',
  },
  {
    id: 'EVAL-15',
    statement:
      'The design narrative is graded by reference and required for a top grade: a missing or insubstantial walkthrough both loses explanation points and caps the letter grade below an A.',
  },
  // STAR repository
  { id: 'STAR-1', statement: 'STAR stories support create, read, update and delete.' },
  { id: 'STAR-2', statement: 'Stories are searchable and filterable by tag.' },
  { id: 'STAR-3', statement: 'A story can link to a prompt and an experience.' },
  // Business-workflow (product) layer
  {
    id: 'PRD-1',
    statement:
      'A workflow prompt presents its API contract, events, ingest SLAs and entity lifecycle beside the prose requirements.',
  },
  {
    id: 'PRD-2',
    statement:
      'Workflow coverage is claimed by reference — a Fulfills pick and event emissions — and corroborated structurally, never by matching names.',
  },
  {
    id: 'PRD-3',
    statement:
      'On a workflow prompt, declaring nothing scores the product dimension 0; on any other prompt it is not assessed and renormalizes out.',
  },
  {
    id: 'PRD-4',
    statement:
      'Workflow coverage chips show the same corroboration verdict the grade will use, live while authoring.',
  },
  {
    id: 'PRD-5',
    statement:
      'Freshness SLAs are graded structurally: declared polling cadence and push wiring against the budgets the prompt states.',
  },
  {
    id: 'PRD-6',
    statement:
      'The workability axis reports ordinal factor evaluations with rationales and never moves the deterministic score.',
  },
] as const;

export const CRITERION_IDS = CRITERIA.map((criterion) => criterion.id);
