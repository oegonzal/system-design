/**
 * The quality-loop pipelines the studio runs, by id. Declared once so the
 * pipeline definitions, the studio API's calls and the e2e stub name the same
 * two strings.
 */

/** A canvas submission judged (`maxIterations: 1`) or coached (more). */
export const CANVAS_PIPELINE_ID = 'system-design-canvas';

/** A system-design prompt drafted from an engineer's experience. */
export const PROMPT_PIPELINE_ID = 'design-prompt';
