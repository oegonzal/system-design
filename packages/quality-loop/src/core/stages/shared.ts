/**
 * What every model-facing stage shares: the stage names the trace uses, the
 * diagnostics a stage leaves when it cannot answer, and the one way a lens
 * asks the model once per sample.
 */
import type { Diagnostic, DiagnosticReason, LensOutcome } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';

import type { LensUnit } from '../ports';

export const CRITERIA_STAGE = 'criteria';
export const PRODUCER_STAGE = 'producer';
export const LENSES_STAGE = 'lenses';

export const diagnostic = (
  stage: string,
  sample: number | null,
  reason: DiagnosticReason,
  detail: string | null = null,
): Diagnostic => ({ stage, sample, reason, detail });

/** A diagnostic from a stage that runs once, so no sample to name. */
export const stageDiagnostic = (
  stage: string,
  reason: DiagnosticReason,
  detail: string | null = null,
): Diagnostic => diagnostic(stage, null, reason, detail);

/** A lens sample that produced nothing: never evidence, always traced. */
export const skipped = <R>(
  stage: string,
  sample: number | null,
  reason: DiagnosticReason,
  detail: string | null = null,
): LensOutcome<R> => ({ report: null, diagnostic: diagnostic(stage, sample, reason, detail) });

/**
 * One unit per sample: the same request to that sample's own client, becoming
 * a report shaped by `report` or the diagnostic that says why there is none.
 *
 * The sample number comes from the client's position and is fixed here, before
 * anything is in flight — never from the order answers arrive. Agreement is
 * counted across a lens's own sample numbers, so two samples that renumbered
 * themselves by arrival could collide and silence the lens they came from.
 */
export function sampleUnits<Response, R>(
  lensId: string,
  clients: readonly LlmClient[],
  request: StructuredRequest<Response>,
  report: (sample: number, response: Response) => R,
): LensUnit<R>[] {
  return clients.map((llm, index) => async () => {
    const sample = index + 1;
    const response = await llm.completeStructured(request);
    return response === null
      ? skipped(lensId, sample, 'llm-failed')
      : { report: report(sample, response), diagnostic: null };
  });
}

/** A lens that cannot run at all still plans one unit, carrying its diagnostic. */
export const planned = <R>(outcome: LensOutcome<R>): LensUnit<R>[] => [
  () => Promise.resolve(outcome),
];
