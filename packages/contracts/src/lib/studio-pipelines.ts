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

/** The canvas pipeline's `maxCriteria`; a rubric above it is refused by the loop. */
export const CANVAS_MAX_CRITERIA = 24;
