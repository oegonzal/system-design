/**
 * What a caller that would draw on a finished run's best iteration is told.
 * `admitted`: it may. `fell-short`: the run was judged, and a gate or the bar
 * said no. The other two are not verdicts at all — `no-rubric`: no criteria
 * were derived or supplied, so no lens had anything to judge against;
 * `no-artifact`: no iteration ran, or the best one produced nothing. Kept
 * apart so "nothing was judged" never reads as "judged and found wanting".
 *
 * The loop computes it (`core/outputs/run-outputs.ts`) and an orchestrator
 * step reports it on its record; a caller reads the report and never
 * recomputes it. Declared here so the report is typed where it is read; the
 * loop's own tuple is pinned equal by a spec there.
 */
export const ADMISSIONS = ['admitted', 'fell-short', 'no-rubric', 'no-artifact'] as const;
export type Admission = (typeof ADMISSIONS)[number];

export const isAdmission = (value: unknown): value is Admission =>
  typeof value === 'string' && (ADMISSIONS as readonly string[]).includes(value);
