import type { Diagnostic, DiagnosticReason, LensOutcome } from '../contracts';

export const CRITERIA_STAGE = 'criteria';
export const PRODUCER_STAGE = 'producer';
export const LENSES_STAGE = 'lenses';

export const diagnostic = (
  stage: string,
  sample: number | null,
  reason: DiagnosticReason,
  detail: string | null = null,
): Diagnostic => ({ stage, sample, reason, detail });

/** A lens sample that produced nothing: never evidence, always traced. */
export const skipped = <R>(
  stage: string,
  sample: number | null,
  reason: DiagnosticReason,
  detail: string | null = null,
): LensOutcome<R> => ({ report: null, diagnostic: diagnostic(stage, sample, reason, detail) });
