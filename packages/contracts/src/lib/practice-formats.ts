import type { CanvasCriterionKind } from './studio-pipelines';

/**
 * The shapes a practice session can take, declared once as data: what the
 * author is asked to produce, which competencies the prompt leans on, and
 * the guidance the prompt writer and the criteria deriver read. A prompt
 * carries one format for its life; the studio shows the format's own hint
 * and the generator writes toward it. Nothing switches on a format id — a
 * reader looks its row up here and follows what the row declares.
 */
export const PRACTICE_FORMAT_IDS = [
  'system',
  'model',
  'boundaries',
  'workflow',
  'evolution',
  'interview',
] as const;
export type PracticeFormatId = (typeof PRACTICE_FORMAT_IDS)[number];

/** How much of the prompt the author sees: all of it, or its first section until the interviewer discloses more. */
export const PROMPT_REVEALS = ['whole', 'first-section'] as const;
export type PromptReveal = (typeof PROMPT_REVEALS)[number];

/** Whether the rubric is on the page from the start, or disclosed criterion by criterion as the interviewer answers. */
export const RUBRIC_REVEALS = ['shown', 'disclosed'] as const;
export type RubricReveal = (typeof RUBRIC_REVEALS)[number];

/**
 * What moves a session from one phase to the next: the author saying so
 * (`advance`), the deep dive being opened (`probe`), or the design being
 * submitted (`submit`). Nothing is forced at a phase's time; the clock is
 * recorded, not enforced.
 */
export const PHASE_ADVANCES = ['advance', 'probe', 'submit'] as const;
export type PhaseAdvance = (typeof PHASE_ADVANCES)[number];

export interface InterviewPhase {
  id: string;
  label: string;
  /** The time an interviewer would give it; shown as a countdown, never enforced. */
  minutes: number;
  advanceOn: PhaseAdvance;
}

/** The parts of a submission a format asks for, beyond the diagram every format has. */
export const PRACTICE_PARTS = ['brief', 'model', 'narrative'] as const;
export type PracticePart = (typeof PRACTICE_PARTS)[number];

export type PartExpectation = 'required' | 'optional';

export interface PracticeFormat {
  label: string;
  /** One sentence for the author: what this format practises. */
  blurb: string;
  parts: Record<PracticePart, PartExpectation>;
  /** The criterion kinds the format leans on: what the prompt writer draws out and the deriver looks for first. */
  emphasis: readonly CanvasCriterionKind[];
  /** Read by the prompt writer and the criteria deriver as a section of the goal. */
  guidance: string;
  reveal: PromptReveal;
  rubric: RubricReveal;
  /** The timed phases of the session, in order; empty for a format with no clock. */
  phases: readonly InterviewPhase[];
  /** How many unbound criteria the interviewer probes in a deep dive; 0 for a format with no interviewer. */
  probes: number;
}

/** The three fields every format without an interviewer declares alike. */
const UNTIMED = { reveal: 'whole', rubric: 'shown', phases: [], probes: 0 } as const;

export const PRACTICE_FORMATS = {
  system: {
    ...UNTIMED,
    label: 'Whole system',
    blurb:
      'Design the whole system: its parts, its data, its contracts and the trade-offs between them.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['functional', 'domain_model', 'interface', 'boundary', 'tradeoff'],
    guidance:
      'A whole-system design in one session: the capabilities, the data owned, the contracts exposed, where responsibility is split, and the decisions a candidate must defend. State a load figure only where load genuinely shaped the system.',
  },
  model: {
    ...UNTIMED,
    label: 'Domain model and API',
    blurb:
      'Model the entities, who owns them and the invariants they hold, and design the contracts over them.',
    parts: { brief: 'optional', model: 'required', narrative: 'optional' },
    emphasis: ['domain_model', 'interface', 'tradeoff'],
    guidance:
      'A problem whose difficulty is in the data and the contracts: entities with owners, keys, invariants and lifecycle states; operations with idempotency, pagination, versioning and error semantics; the modelling decisions a candidate must defend. Say little about load.',
  },
  boundaries: {
    ...UNTIMED,
    label: 'Boundaries and modules',
    blurb:
      'Decide where responsibility is split, which way dependencies point, and what to build or buy.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['boundary', 'interface', 'tradeoff'],
    guidance:
      'A problem whose difficulty is in the seams: which part owns what, which way the dependencies point, what is built and what is bought, and the cost of each split. The right number of parts is a decision the candidate must defend.',
  },
  workflow: {
    ...UNTIMED,
    label: 'Workflows and failure handling',
    blurb:
      'Carry a business process end to end: its states, what happens when a step fails, and how it recovers.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['workflow', 'communication', 'domain_model', 'tradeoff'],
    guidance:
      'A business process with states, deadlines, retries and compensations: what happens when a step fails, arrives twice or arrives late, and who is told. Ask for the process walked end to end, every hop between the parts named with its call style and failure handling, not for a fleet sized to a peak.',
  },
  evolution: {
    ...UNTIMED,
    label: 'Evolution and migration',
    blurb:
      'Change a system that is running: migrate, roll out, roll back, and keep what depends on it working.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['evolution', 'boundary', 'tradeoff'],
    guidance:
      'A running system that must change without stopping: what exists today, what must be true at the end, how the change is staged and reversed, and what keeps working in between. The order of the steps is the design.',
  },
  interview: {
    label: 'Interview',
    blurb:
      'Face an interviewer: clarify the problem, design against the clock, then defend the design under probing questions.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['functional', 'tradeoff', 'boundary', 'non_functional'],
    guidance:
      'A problem posed the way an interviewer poses it: a short scenario first, and every other section written as the interviewer’s own notes — the requirements, the data, the targets, the constraints and the decisions a candidate must be led to — because the candidate sees the scenario alone and must ask for the rest. Write each note so an interviewer can answer a question from it without inventing.',
    reveal: 'first-section',
    rubric: 'disclosed',
    phases: [
      { id: 'clarify', label: 'Clarify', minutes: 10, advanceOn: 'advance' },
      { id: 'design', label: 'Design', minutes: 35, advanceOn: 'probe' },
      { id: 'deep-dive', label: 'Deep dive', minutes: 15, advanceOn: 'submit' },
    ],
    probes: 3,
  },
} as const satisfies Record<PracticeFormatId, PracticeFormat>;

/** A format's row, typed as the interface — for a caller whose id type the table's literal keys will not index. */
export const practiceFormat = (id: PracticeFormatId): PracticeFormat => PRACTICE_FORMATS[id];

/** The format a prompt has when none is chosen: the whole system, as the studio always practised. */
export const DEFAULT_PRACTICE_FORMAT: PracticeFormatId = 'system';

const isPracticeFormatId = (value: string): value is PracticeFormatId =>
  (PRACTICE_FORMAT_IDS as readonly string[]).includes(value);

/**
 * The format a library document carries, from the folder it sits in: a folder
 * named for a declared format is that format, anything else — another
 * pipeline's folder, the root — is the default. A declared lookup, never a
 * reading of the document's prose.
 */
export const practiceFormatForLibraryFolder = (folder: string | null): PracticeFormatId =>
  folder !== null && isPracticeFormatId(folder) ? folder : DEFAULT_PRACTICE_FORMAT;

/**
 * The format to practise one competency in: the first declared format whose
 * emphasis names the kind, so a weak competency is practised where the
 * generator writes toward it; the default when no format emphasises it.
 */
export const practiceFormatForKind = (kind: CanvasCriterionKind): PracticeFormatId =>
  PRACTICE_FORMAT_IDS.find((id) =>
    (PRACTICE_FORMATS[id].emphasis as readonly CanvasCriterionKind[]).includes(kind),
  ) ?? DEFAULT_PRACTICE_FORMAT;
