import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../../core/contracts';
import { fullExchange, fullIteration, fullRecord, fullTrace, roundtrip } from './testing';
import { toRows } from './to-rows';
import { toSummary } from './to-summary';

describe('the run rows', () => {
  it('[QL-13] splits a complete record into rows and reassembles the wire record exactly', () => {
    const source = fullRecord();
    let n = 0;
    const rows = toRows(source, () => `iteration-${++n}`);

    expect(rows.run).toMatchObject({
      id: source.runId,
      pipelineVersion: '0.0.1',
      finalDecision: 'revise',
      stopReason: 'max-iterations',
      overall: 71,
      bestIteration: 1,
      exchangeCount: 2,
      lessons: [
        { kind: 'persisted', subject: 'wrong|text', iterations: [1], detail: 'still there' },
      ],
    });
    expect(rows.criteria.map((row) => [row.position, row.criterionId])).toEqual([
      [0, 'c1'],
      [1, 'c2'],
    ]);
    expect(rows.iterations[0]?.row.id).toBe('iteration-1');
    expect(
      rows.iterations[0]?.findings.map((row) => [row.iterationId, row.position, row.key]),
    ).toEqual([
      ['iteration-1', 0, 'gap|part.1'],
      ['iteration-1', 1, 'wrong|text'],
    ]);
    expect(
      rows.iterations[0]?.results.map((row) => [row.position, row.criterionId, row.confidence]),
    ).toEqual([
      [0, 'c1', 'high'],
      [1, 'c2', null],
    ]);

    expect(roundtrip(rows)).toEqual(toRunDto(source));
  });

  it('[QL-13] keeps an escalated run honest: no criteria, no artifact, the diagnostics intact', () => {
    const source = fullRecord({
      llm: { enabled: false, model: null, reason: 'deterministic' },
      exchanges: [],
      trace: fullTrace({
        contract: { goal: '# Goal', criteria: [] },
        finalDecision: 'escalate',
        stopReason: 'escalated',
        lessons: [],
        iterations: [
          fullIteration({
            artifact: null,
            rendered: null,
            locations: [],
            validation: [],
            critics: [],
            evaluators: [],
            ledger: {
              artifactPresent: false,
              validation: [],
              criteria: [],
              findings: [],
              discarded: [],
              diagnostics: [
                { stage: 'producer', sample: null, reason: 'llm-disabled', detail: null },
              ],
            },
            remediations: [],
          }),
        ],
      }),
    });
    const rows = toRows(source);

    expect(rows.criteria).toEqual([]);
    expect(rows.iterations[0]?.findings).toEqual([]);
    expect(roundtrip(rows)).toEqual(toRunDto(source));
  });

  it('[QL-13] a failed run with no trace stays a header only', () => {
    const source = fullRecord({
      status: 'failed',
      trace: null,
      exchanges: [fullExchange('criteria')],
      error: { name: 'Error', message: 'boom', stack: null },
    });
    const rows = toRows(source);

    expect(rows.iterations).toEqual([]);
    expect(rows.run).toMatchObject({
      finalDecision: null,
      lessons: null,
      overall: null,
      exchangeCount: 1,
    });
    expect(roundtrip(rows)).toEqual(toRunDto(source));
    expect(roundtrip(rows).trace).toBeNull();
  });

  it('projects the list row from the header and the counts', () => {
    const rows = toRows(fullRecord());
    expect(toSummary(rows.run, { iterations: 1, criteria: 2 })).toEqual({
      runId: '2026-09-06T00-00-00-000-abc123-quality',
      pipeline: 'tiny',
      pipelineVersion: '0.0.1',
      status: 'complete',
      startedAt: '2026-09-06T00:00:00.000Z',
      finishedAt: '2026-09-06T00:00:05.000Z',
      finalDecision: 'revise',
      stopReason: 'max-iterations',
      overall: 71,
      iterations: 1,
      criteria: 2,
      exchangeCount: 2,
      llm: { enabled: true, model: 'test-model', reason: null },
    });
  });
});
