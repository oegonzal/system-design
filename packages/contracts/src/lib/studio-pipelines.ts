/**
 * The quality-loop pipelines the studio runs, by id, and the vocabulary the
 * canvas pipeline grades with. Declared once so the pipeline definition
 * (`satisfies`), the studio API's calls, the studio's labels and the e2e stub
 * name the same strings.
 */
import type { SuccessCriterion } from './quality-loop/evidence';

/** A canvas submission judged (`maxIterations: 1`) or coached (more). */
export const CANVAS_PIPELINE_ID = 'system-design-canvas';

/** A system-design prompt drafted from an engineer's experience. */
export const PROMPT_PIPELINE_ID = 'design-prompt';

/**
 * The competencies a design is graded as, which are the canvas pipeline's
 * criterion kinds: what a senior software-design interview asks of a
 * candidate, each one earned by the criteria of that kind a prompt's rubric
 * states. Scale is one of them, weighted only by the figures a prompt gives
 * it. Declared once so the pipeline definition (`satisfies`), the studio's
 * `criteriaFromDraft` and the reader's labels cannot drift; the pipeline's
 * task keeps them an open record with a meaning per kind. Additive on
 * purpose: a kind renamed here would strand every stored rubric, since the
 * loop refuses a kind the pipeline no longer prices.
 */
export const CANVAS_CRITERION_KINDS = [
  'functional',
  'domain_model',
  'interface',
  'boundary',
  'workflow',
  'non_functional',
  'scale',
  'evolution',
  'tradeoff',
  'constraint',
] as const;
export type CanvasCriterionKind = (typeof CANVAS_CRITERION_KINDS)[number];

/** What a reader calls each canvas criterion kind — a heading, a badge, an export column. */
export const CANVAS_CRITERION_KIND_LABELS = {
  functional: 'Functional',
  domain_model: 'Domain model',
  interface: 'Interface',
  boundary: 'Boundary',
  workflow: 'Workflow',
  non_functional: 'Non-functional',
  scale: 'Scale',
  evolution: 'Evolution',
  tradeoff: 'Trade-off',
  constraint: 'Constraint',
} as const satisfies Record<CanvasCriterionKind, string>;

const isCanvasCriterionKind = (kind: string): kind is CanvasCriterionKind =>
  (CANVAS_CRITERION_KINDS as readonly string[]).includes(kind);

/**
 * The declared label of a criterion kind, or null for a kind the canvas
 * pipeline does not declare — kinds are an open vocabulary on a pipeline, so
 * a reader falls back to the token itself rather than branching on it.
 */
export const canvasCriterionKindLabel = (kind: string): string | null =>
  isCanvasCriterionKind(kind) ? CANVAS_CRITERION_KIND_LABELS[kind] : null;

/**
 * The canvas pipeline's finding types — what a critic may call a defect.
 * Declared once for the same reason the kinds are: the pipeline definition
 * (`satisfies`) says what each means and prices it, and the studio words them
 * wherever a lens wrote the token into a sentence. The pipeline's own records
 * stay open to the engine.
 */
export const CANVAS_FINDING_TYPES = [
  'missing_requirement',
  'constraint_violation',
  'scale_mismatch',
  'unhandled_failure',
  'data_integrity',
  'topology_defect',
  'interface_defect',
  'operability_gap',
  'unbacked_claim',
  'unexplained_component',
  'contradiction',
  'bad_assumption',
  'model_defect',
  'boundary_defect',
  'workflow_gap',
  'tradeoff_missing',
] as const;
export type CanvasFindingType = (typeof CANVAS_FINDING_TYPES)[number];

/**
 * The criteria every canvas rubric carries, whatever the prompt: the
 * trade-off reasoning a senior design is graded on even when the prompt poses
 * no decision of its own — why this and not that, at every load-bearing
 * choice and at every binding that had a choice, with the assumptions said. They close the rubric, after the prompt's own rows,
 * so a prompt's ids never move; the studio appends them to every rubric it
 * stores — derived, drafted or migrated — and the pipeline's `reasoning`
 * dimension is earned through them. The loop uses a supplied rubric verbatim,
 * which is why these are the studio's to add and not the deriver's.
 */
export const CANVAS_STANDING_CRITERIA: readonly Pick<SuccessCriterion, 'kind' | 'statement'>[] = [
  {
    kind: 'tradeoff',
    statement:
      'Every load-bearing decision records at least one alternative considered and the cost accepted.',
  },
  {
    kind: 'tradeoff',
    statement:
      'Where a requirement could be held by more than one mechanism, its binding says why the chosen one and not the other.',
  },
  {
    kind: 'tradeoff',
    statement: 'The assumptions the design depends on are stated, not smuggled into the drawing.',
  },
];

/** The canvas pipeline's `maxCriteria`; a rubric above it is refused by the loop. */
export const CANVAS_MAX_CRITERIA = 27;

/**
 * A prompt's own criteria, as derived or drafted, closed by the standing
 * ones: the prompt's rows keep the first ids, the standing criteria take the
 * last, and the whole never passes the pipeline's cap — a prompt whose rows
 * would leave no room for the standing criteria keeps its first rows.
 */
export function withStandingCriteria(
  own: readonly Pick<SuccessCriterion, 'kind' | 'statement'>[],
): SuccessCriterion[] {
  const room = CANVAS_MAX_CRITERIA - CANVAS_STANDING_CRITERIA.length;
  return [...own.slice(0, room), ...CANVAS_STANDING_CRITERIA].map((item, index) => ({
    id: `c${index + 1}`,
    kind: item.kind,
    statement: item.statement,
  }));
}
