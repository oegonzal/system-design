/**
 * The quality-loop pipelines the studio runs, by id. Declared once so the
 * pipeline definitions, the studio API's calls and the e2e stub name the same
 * two strings.
 */

/** A canvas submission judged (`maxIterations: 1`) or coached (more). */
export const CANVAS_PIPELINE_ID = 'system-design-canvas';

/** A system-design prompt drafted from an engineer's experience. */
export const PROMPT_PIPELINE_ID = 'design-prompt';

/**
 * The canvas pipeline's criterion kinds, in the order a generated prompt's
 * sections yield them. Declared once so the pipeline definition
 * (`satisfies`) and the studio's `criteriaFromDraft` cannot drift; the
 * pipeline's task keeps them an open record with a meaning per kind.
 */
export const CANVAS_CRITERION_KINDS = [
  'functional',
  'non_functional',
  'scale',
  'constraint',
] as const;
export type CanvasCriterionKind = (typeof CANVAS_CRITERION_KINDS)[number];

/** What a reader calls each canvas criterion kind — a heading, a badge, an export column. */
export const CANVAS_CRITERION_KIND_LABELS = {
  functional: 'Functional',
  non_functional: 'Non-functional',
  scale: 'Scale',
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

/** The canvas pipeline's `maxCriteria`; a rubric above it is refused by the loop. */
export const CANVAS_MAX_CRITERIA = 24;
