import type { DegradedSampleDto, DiagnosticReason } from '@sysdesign/contracts';

import { humanizeToken } from './humanize';

/** Why a lens sample answered nothing, in the author's terms. Every reason the contract names. */
const SAMPLE_MISSING: Record<DiagnosticReason, string> = {
  'llm-failed': 'the model did not answer',
  'token-clipped': 'its answer was cut off',
  'llm-artifact-rejected': 'its answer did not fit the report',
  'not-applicable': 'not applicable',
};

/** One missing lens sample as a reader names it: `critic scale #1 (the model did not answer)`. */
const describeSample = ({ stage, sample, reason }: DegradedSampleDto): string =>
  `${humanizeToken(stage).toLowerCase()}${sample === null ? '' : ` #${sample}`} (${SAMPLE_MISSING[reason]})`;

/**
 * What a grade was computed without, in one sentence — null when every lens
 * answered. The grade stands on the samples that did; the reader is told
 * which did not, by lens and why, never by wire token.
 */
export function degradedNote(degraded: readonly DegradedSampleDto[]): string | null {
  if (degraded.length === 0) return null;
  const count = `${degraded.length} lens ${degraded.length === 1 ? 'sample' : 'samples'}`;
  return `Graded with ${count} missing — ${degraded.map(describeSample).join(', ')}. The score stands on the lenses that answered.`;
}
