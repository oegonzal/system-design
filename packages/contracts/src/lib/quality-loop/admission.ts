/**
 * What a caller that would draw on a finished run's best iteration is told.
 * `admitted`: it may. `fell-short`: the run was judged, and a gate or the bar
 * said no. The other two are not verdicts at all — `no-rubric`: no criteria
 * were derived or supplied, so no lens had anything to judge against;
 * `no-artifact`: no iteration ran, or the best one produced nothing. Kept
 * apart so "nothing was judged" never reads as "judged and found wanting".
 *
 * The loop computes it (`core/outputs/run-outputs.ts`) and an orchestrator
 * step reports it on its record under a declared shape; a caller reads the
 * report with that shape and never recomputes it.
 */
export const ADMISSIONS = ['admitted', 'fell-short', 'no-rubric', 'no-artifact'] as const;
export type Admission = (typeof ADMISSIONS)[number];
