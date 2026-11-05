/**
 * The quality-loop pipelines the studio runs, by id, and the vocabulary the
 * canvas pipeline grades with. Declared once so the pipeline definition
 * (`satisfies`), the studio API's calls, the studio's labels and the e2e stub
 * name the same strings.
 */
import type { PlatformId } from './platforms/service';
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
  'communication',
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
  communication: 'Communication',
} as const satisfies Record<CanvasCriterionKind, string>;

export const isCanvasCriterionKind = (kind: string): kind is CanvasCriterionKind =>
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
  'flow_gap',
  'hop_undeclared',
  'failure_path_missing',
  'integration_misfit',
  'service_misfit',
] as const;
export type CanvasFindingType = (typeof CANVAS_FINDING_TYPES)[number];

/**
 * The criteria every canvas rubric carries, whatever the prompt: the
 * trade-off reasoning a senior design is graded on even when the prompt poses
 * no decision of its own — why this and not that, at every load-bearing
 * choice and at every binding that had a choice, with the assumptions said —
 * and the communication a design is graded on even when the prompt names no
 * request: how every hop is made and what each does when it fails. They
 * close the rubric, after the prompt's own rows, so a prompt's ids never
 * move; the studio appends them to every rubric it stores — derived, drafted
 * or migrated — and the pipeline's `reasoning` dimension is earned through
 * the first three. The loop uses a supplied rubric verbatim, which is why
 * these are the studio's to add and not the deriver's. The trade-off rows
 * stay first: a rubric migrated before the communication rows existed and a
 * rubric written after read alike.
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
  {
    kind: 'communication',
    statement:
      'Every hop between two components states its call style (sync or async) and the mechanism that carries it, and every request path is traced from where it enters to where it comes to rest.',
  },
  {
    kind: 'communication',
    statement:
      'Every asynchronous hop names how a failed or repeated message is handled, and every synchronous hop its timeout and what the caller does when the callee does not answer.',
  },
];

/**
 * The criterion a rubric carries only when its prompt declares a platform: a
 * constraint, so a design that ignores the platform it was set on fails the
 * compliance gate the way any imposed platform ignored does. Worded for any
 * platform — the goal's own section names which.
 */
export const PLATFORM_STANDING_CRITERIA: readonly Pick<SuccessCriterion, 'kind' | 'statement'>[] = [
  {
    kind: 'constraint',
    statement:
      'Every component the declared platform offers a managed service for names that service, and every hop between two platform services uses an integration the platform offers.',
  },
];

/** The standing criteria a prompt's rubric closes with, given the platform it declares — or none. */
export const standingCriteriaFor = (
  platform: PlatformId | null,
): readonly Pick<SuccessCriterion, 'kind' | 'statement'>[] =>
  platform === null
    ? CANVAS_STANDING_CRITERIA
    : [...CANVAS_STANDING_CRITERIA, ...PLATFORM_STANDING_CRITERIA];

/**
 * The canvas pipeline's `maxCriteria`; a rubric above it is refused by the
 * loop. The generator's row targets (26) plus every standing criterion a
 * rubric can carry (6).
 */
export const CANVAS_MAX_CRITERIA = 32;

/**
 * A prompt's own criteria, as derived or drafted, closed by the standing
 * ones for the platform it declares: the prompt's rows keep the first ids,
 * the standing criteria take the last, and the whole never passes the
 * pipeline's cap — a prompt whose rows would leave no room for the standing
 * criteria keeps its first rows.
 */
export function withStandingCriteria(
  own: readonly Pick<SuccessCriterion, 'kind' | 'statement'>[],
  platform: PlatformId | null,
): SuccessCriterion[] {
  const standing = standingCriteriaFor(platform);
  const room = CANVAS_MAX_CRITERIA - standing.length;
  return [...own.slice(0, room), ...standing].map((item, index) => ({
    id: `c${index + 1}`,
    kind: item.kind,
    statement: item.statement,
  }));
}
