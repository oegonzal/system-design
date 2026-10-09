import type { DegradedSampleDto, DiagnosticReason } from '@sysdesign/contracts';

import { counted, humanizeToken } from './humanize';

/** Why a lens sample answered nothing, in the author's terms. Every reason the contract names. */
const SAMPLE_MISSING: Record<DiagnosticReason, string> = {
  'llm-failed': 'the model did not answer',
  'token-clipped': 'its answer was cut off',
  'llm-artifact-rejected': 'its answer did not fit the report',
  'not-applicable': 'not applicable',
  overrun: 'it answered past the size it was asked for',
  refounded: 'the engine re-founded a criterion from the goal',
};

/** One missing lens sample as a reader names it: `critic scale #1 (the model did not answer)`. */
const describeSample = ({ stage, sample, reason }: DegradedSampleDto): string =>
  `${humanizeToken(stage).toLowerCase()}${sample === null ? '' : ` #${sample}`} (${SAMPLE_MISSING[reason]})`;

/** How many lens samples a grade went without, counted: `2 lens samples`. */
const sampleCount = (degraded: readonly DegradedSampleDto[]): string =>
  counted(degraded.length, 'lens sample', 'lens samples');

/**
 * What a scored grade was computed without, in one sentence — null when
 * every lens answered. The grade stands on the samples that did; the reader
 * is told which did not, by lens and why, never by wire token.
 */
export function degradedNote(degraded: readonly DegradedSampleDto[]): string | null {
  if (degraded.length === 0) return null;
  return `Graded with ${sampleCount(degraded)} missing — ${degraded.map(describeSample).join(', ')}. The score stands on the lenses that answered.`;
}

/**
 * The lens samples that did not answer a grade that earned no score — the
 * why behind it, by lens and why each one — null when every lens answered.
 * Nothing stands on the rest: it says so in place of `degradedNote`.
 */
export function unansweredNote(degraded: readonly DegradedSampleDto[]): string | null {
  if (degraded.length === 0) return null;
  return `${sampleCount(degraded)} did not answer: ${degraded.map(describeSample).join(', ')}.`;
}
