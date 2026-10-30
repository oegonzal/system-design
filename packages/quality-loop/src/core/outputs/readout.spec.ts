import type { Decision, QualityRunDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import {
  confirmed,
  criterion,
  decision,
  evidence,
  ledger,
  runDto,
  tinyPipeline,
  traceOf,
  type TinyOutput,
} from '../testing';
import { readoutOf } from './readout';

const ARTIFACT: TinyOutput = { text: 'a draft', parts: ['first'] };

/**
 * A settled run of the tiny pipeline: its one criterion passing, one finding
 * naming the part, decided as given — and held to the bar it asked for, if any.
 */
const judged = (
  finalDecision: Decision,
  overall: number,
  acceptAt: number | null = null,
): QualityRunDto => {
  const run = runDto(
    'r1',
    traceOf({
      artifact: ARTIFACT,
      criteria: [criterion('c1')],
      ledger: ledger({
        criteria: [evidence({ criterionId: 'c1', locationRefs: ['text'] })],
        findings: [
          confirmed({
            key: 'wrong|part.1',
            type: 'wrong',
            locationRefs: ['part.1'],
            rationale: 'the part is not so',
          }),
        ],
      }),
      decision: decision({ finalDecision, scores: { dimensions: {}, overall } }),
      stopReason: finalDecision === 'accept' ? 'accepted' : 'max-iterations',
    }),
  );
  return { ...run, request: { ...run.request, acceptAt } };
};

/** The part, withheld by the finding that names it — the tiny policy declares no withholding, so every ref. */
const WITHHELD = [{ ref: 'part.1', source: 'finding', by: 'wrong', note: 'the part is not so' }];

describe('readoutOf', () => {
  it('[QL-83] a settled run is read at its pipeline’s bar: its admission, and the locations its findings withhold with what withheld them', () => {
    expect(readoutOf(tinyPipeline(), judged('accept', 90))).toEqual({
      admission: 'admitted',
      withheld: WITHHELD,
    });
    // A revise under the bar fell short; the finding withholds the part either way.
    expect(readoutOf(tinyPipeline(), judged('revise', 60))).toEqual({
      admission: 'fell-short',
      withheld: WITHHELD,
    });
  });

  it('[QL-83] a run that raised its bar is read at the raised one: a score admitted at the pipeline’s bar falls short of it', () => {
    const bar = tinyPipeline().policy.thresholds.acceptAt;
    expect(readoutOf(tinyPipeline(), judged('revise', bar + 10))?.admission).toBe('admitted');
    expect(readoutOf(tinyPipeline(), judged('revise', bar + 10, bar + 15))?.admission).toBe(
      'fell-short',
    );
  });

  it('[QL-83] nothing is read while the run runs, when it recorded no iteration, or when no definition is registered to read it by', () => {
    const settled = judged('accept', 90);
    expect(
      readoutOf(tinyPipeline(), { ...settled, status: 'running', finishedAt: null }),
    ).toBeNull();
    expect(readoutOf(tinyPipeline(), runDto('r2', null))).toBeNull();
    expect(readoutOf(undefined, settled)).toBeNull();

    // A run that failed after recording iterations has final ones, and is read by its standing.
    const revised = judged('revise', 90);
    const failed: QualityRunDto = {
      ...revised,
      status: 'failed',
      trace: revised.trace === null ? null : { ...revised.trace, stopReason: null },
      error: { name: 'Boom', message: 'the model went away', stack: null },
    };
    expect(readoutOf(tinyPipeline(), failed)).toEqual({
      admission: 'admitted',
      withheld: WITHHELD,
    });
  });
});
