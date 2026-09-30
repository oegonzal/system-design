/**
 * What every model-facing stage shares: the stage names the trace uses, the
 * diagnostics a stage leaves when it cannot answer, and the one way a lens
 * asks the model once per sample.
 */
import type { Diagnostic, DiagnosticReason, LensOutcome } from '@sysdesign/contracts';
import type { LlmClient, StructuredRequest } from '@sysdesign/llm';

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
 * The same request to each sample's client in turn, one outcome per sample: a
 * report shaped by `report`, or the diagnostic that says why there is none.
 * Sequential on purpose — the clients are already scoped one per sample.
 */
export async function sampleEach<Response, R>(
  lensId: string,
  clients: readonly LlmClient[],
  request: StructuredRequest<Response>,
  report: (sample: number, response: Response) => R,
): Promise<LensOutcome<R>[]> {
  const outcomes: LensOutcome<R>[] = [];
  for (const [index, llm] of clients.entries()) {
    const sample = index + 1;
    if (!llm.enabled) {
      outcomes.push(skipped(lensId, sample, 'llm-disabled'));
      continue;
    }
    const response = await llm.completeStructured(request);
    outcomes.push(
      response === null
        ? skipped(lensId, sample, 'llm-failed')
        : { report: report(sample, response), diagnostic: null },
    );
  }
  return outcomes;
}
