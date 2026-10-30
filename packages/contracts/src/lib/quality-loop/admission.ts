import { z } from 'zod';

import { WITHHOLDING_SOURCES } from './pipeline';

/**
 * What a caller that would draw on a finished run's best iteration is told.
 * `admitted`: it may. `fell-short`: the run was judged, and a gate or the bar
 * said no. The other two are not verdicts at all — `no-rubric`: no criteria
 * were derived or supplied, so no lens had anything to judge against;
 * `no-artifact`: no iteration ran, or the best one produced nothing. Kept
 * apart so "nothing was judged" never reads as "judged and found wanting".
 *
 * The loop computes it (`core/outputs/run-outputs.ts`) and answers it on
 * every settled run's read as part of its readout (`runReadoutSchema`); an
 * orchestrator step reports the same on its record under a declared shape. A
 * caller reads it there, with that shape, and never recomputes it.
 */
export const ADMISSIONS = ['admitted', 'fell-short', 'no-rubric', 'no-artifact'] as const;
export type Admission = (typeof ADMISSIONS)[number];

/**
 * One location of a run's best iteration that a reader withholds, with what
 * withheld it — a finding's type, a validator's id, or the reason a reader
 * declares for what the goal's index holds an item to — and why, in the
 * judge's own words: for a person's eye, never for a route, which goes by the
 * ref alone. The source is the shared vocabulary's (`WITHHOLDING_SOURCES`).
 * Reported beside the run's admission, so a caller reads both off the one
 * readout and recomputes neither.
 */
export const withheldRefSchema = z.strictObject({
  ref: z.string().min(1),
  source: z.enum(WITHHOLDING_SOURCES),
  by: z.string().min(1),
  note: z.string().nullable(),
});
export type WithheldRef = z.infer<typeof withheldRefSchema>;

/**
 * What a settled run says of itself to a caller that would draw on its best
 * iteration: its admission at the bar it was held to — the bar it asked for,
 * else its pipeline's — and the locations of its best artifact a reader
 * withholds. `GET /runs/:id` answers it as the run's `readout`, null until the
 * run settles; the loop computes both off engine facts and the pipeline's own
 * declarations (`core/outputs/readout.ts`), so a caller routes by the readout
 * and recomputes neither.
 */
export const runReadoutSchema = z.strictObject({
  admission: z.enum(ADMISSIONS),
  withheld: z.array(withheldRefSchema),
});
export type RunReadoutDto = z.infer<typeof runReadoutSchema>;
