/**
 * The improver's own client token, distinct from the evaluator's LLM_CLIENT:
 * the two read different determinism switches. The evaluator must stay
 * byte-reproducible under EVAL_DETERMINISTIC; the improver only proposes —
 * every proposal is re-scored by the deterministic engine — so it may run
 * live (IMPROVER_DETERMINISTIC=0) while grading stays pinned.
 */
export const IMPROVER_LLM = Symbol('IMPROVER_LLM');
