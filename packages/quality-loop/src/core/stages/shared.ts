/**
 * What every model-facing stage shares: the stage names the trace uses, the
 * diagnostics a stage leaves when it cannot answer — or answered past a size
 * it was asked for — and the one way a lens asks the model once per sample.
 */
import {
  describeOverrun,
  type Diagnostic,
  type DiagnosticFacts,
  type DiagnosticReason,
  type LensOutcome,
  type Overrun,
  type SchemaIssue,
} from '@sysdesign/contracts';
import { asDetailed, type LlmClient, type StructuredRequest } from '@sysdesign/llm';

import type { LensUnit } from '../ports';

export const CRITERIA_STAGE = 'criteria';
export const PRODUCER_STAGE = 'producer';
export const LENSES_STAGE = 'lenses';

export const diagnostic = (
  stage: string,
  sample: number | null,
  reason: DiagnosticReason,
  detail: string | null = null,
  facts?: DiagnosticFacts,
): Diagnostic => ({ stage, sample, reason, detail, ...(facts ? { facts } : {}) });

/** A diagnostic from a stage that runs once, so no sample to name. */
export const stageDiagnostic = (
  stage: string,
  reason: DiagnosticReason,
  detail: string | null = null,
  facts?: DiagnosticFacts,
): Diagnostic => diagnostic(stage, null, reason, detail, facts);

/**
 * A model that answered nothing, with the faults of the reply the schema
 * refused when there was one — kept as facts, so whoever asks next can name
 * them. Nothing parsed, or an API error, leaves none.
 */
export const failedDiagnostic = (
  stage: string,
  sample: number | null,
  issues: readonly SchemaIssue[],
): Diagnostic =>
  diagnostic(
    stage,
    sample,
    'llm-failed',
    null,
    issues.length > 0 ? { issues: [...issues] } : undefined,
  );

/** One field a reply wrote past the size it was asked for, as the seam handled it. */
export const overrunDiagnostic = (stage: string, overrun: Overrun): Diagnostic =>
  stageDiagnostic(stage, 'overrun', describeOverrun(overrun), { overrun });

/** A lens sample that produced nothing: never evidence, always traced. */
export const skipped = <R>(
  stage: string,
  sample: number | null,
  reason: DiagnosticReason,
  detail: string | null = null,
): LensOutcome<R> => ({ report: null, diagnostic: diagnostic(stage, sample, reason, detail) });

/**
 * One unit per sample: the same request to that sample's own client, becoming
 * a report shaped by `report` or the diagnostic that says why there is none —
 * with the faults of the reply the schema refused, when it refused one.
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
    const reply = await asDetailed(llm).completeStructuredDetailed(request);
    return reply.value === null
      ? { report: null, diagnostic: failedDiagnostic(lensId, sample, reply.issues) }
      : { report: report(sample, reply.value), diagnostic: null };
  });
}

/** A lens that cannot run at all still plans one unit, carrying its diagnostic. */
export const planned = <R>(outcome: LensOutcome<R>): LensUnit<R>[] => [
  () => Promise.resolve(outcome),
];
