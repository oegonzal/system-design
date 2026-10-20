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
] as const;
export type PracticeFormatId = (typeof PRACTICE_FORMAT_IDS)[number];

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
}

export const PRACTICE_FORMATS = {
  system: {
    label: 'Whole system',
    blurb:
      'Design the whole system: its parts, its data, its contracts and the trade-offs between them.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['functional', 'domain_model', 'interface', 'boundary', 'tradeoff'],
    guidance:
      'A whole-system design in one session: the capabilities, the data owned, the contracts exposed, where responsibility is split, and the decisions a candidate must defend. State a load figure only where load genuinely shaped the system.',
  },
  model: {
    label: 'Domain model and API',
    blurb:
      'Model the entities, who owns them and the invariants they hold, and design the contracts over them.',
    parts: { brief: 'optional', model: 'required', narrative: 'optional' },
    emphasis: ['domain_model', 'interface', 'tradeoff'],
    guidance:
      'A problem whose difficulty is in the data and the contracts: entities with owners, keys, invariants and lifecycle states; operations with idempotency, pagination, versioning and error semantics; the modelling decisions a candidate must defend. Say little about load.',
  },
  boundaries: {
    label: 'Boundaries and modules',
    blurb:
      'Decide where responsibility is split, which way dependencies point, and what to build or buy.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['boundary', 'interface', 'tradeoff'],
    guidance:
      'A problem whose difficulty is in the seams: which part owns what, which way the dependencies point, what is built and what is bought, and the cost of each split. The right number of parts is a decision the candidate must defend.',
  },
  workflow: {
    label: 'Workflows and failure handling',
    blurb:
      'Carry a business process end to end: its states, what happens when a step fails, and how it recovers.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['workflow', 'domain_model', 'tradeoff'],
    guidance:
      'A business process with states, deadlines, retries and compensations: what happens when a step fails, arrives twice or arrives late, and who is told. Ask for the process walked end to end, not for a fleet sized to a peak.',
  },
  evolution: {
    label: 'Evolution and migration',
    blurb:
      'Change a system that is running: migrate, roll out, roll back, and keep what depends on it working.',
    parts: { brief: 'required', model: 'optional', narrative: 'required' },
    emphasis: ['evolution', 'boundary', 'tradeoff'],
    guidance:
      'A running system that must change without stopping: what exists today, what must be true at the end, how the change is staged and reversed, and what keeps working in between. The order of the steps is the design.',
  },
} as const satisfies Record<PracticeFormatId, PracticeFormat>;

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
