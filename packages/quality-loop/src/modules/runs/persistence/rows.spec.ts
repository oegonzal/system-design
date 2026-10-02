import { recallInProgress, recallOf } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { toRunDto } from '../../../core/contracts';
import { progressOf } from '../../../core/loop/progress';
import { fullExchange, fullIteration, fullRecord, fullTrace, roundtrip } from './testing';
import { progressRows, toRows } from './to-rows';
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

  it('[QL-13] a running loop’s progress is the same child rows its close will write', () => {
    const source = fullRecord();
    const trace = source.trace;
    if (trace === null) throw new Error('the full record carries a trace');
    const progress = { ...trace, stopReason: null };
    let a = 0;
    let b = 0;
    const closing = toRows(source, () => `iteration-${++a}`);
    expect(progressRows(source.runId, progress, () => `iteration-${++b}`)).toEqual({
      criteria: closing.criteria,
      iterations: closing.iterations,
    });
  });

  it('[QL-13] a running run reads back as the progress the loop published: its iterations so far, its standing, no stop reason', () => {
    const settled = fullTrace({
      iterations: [fullIteration(), fullIteration({ iteration: 2, mode: 'revise' })],
    });
    const progress = progressOf(settled, settled.iterations);
    if (progress === null) throw new Error('two iterations stand somewhere');
    // Open wrote the version from the definition; progress wrote the children.
    const header = {
      ...toRows(fullRecord({ status: 'running', finishedAt: null, trace: null })).run,
      pipelineVersion: settled.pipeline.version,
    };
    let n = 0;
    const children = progressRows(header.id, progress, () => `iteration-${++n}`);

    const running = roundtrip({ run: header, ...children }).trace;
    expect(running).toEqual(progress);
    // A tie keeps the earlier crown, as the loop's own gate does.
    expect(running).toMatchObject({ bestIteration: 1, finalDecision: 'revise', stopReason: null });
    // Nothing finished yet is no trace.
    expect(
      roundtrip({ run: header, criteria: children.criteria, iterations: [] }).trace,
    ).toBeNull();
  });

  it('[QL-13] iterations a run recorded are final: one that failed before settling reads back with them, its standing and no stop reason', () => {
    const settled = fullTrace({
      iterations: [fullIteration(), fullIteration({ iteration: 2, mode: 'revise' })],
    });
    const progress = progressOf(settled, settled.iterations);
    if (progress === null) throw new Error('two iterations stand somewhere');
    // The loop threw, or the janitor swept it: the header failed, the progress rows stand.
    const failed = {
      ...toRows(
        fullRecord({
          status: 'failed',
          trace: null,
          error: { name: 'Error', message: 'the model went away', stack: null },
        }),
      ).run,
      pipelineVersion: settled.pipeline.version,
    };
    const children = progressRows(failed.id, progress);

    const read = roundtrip({ run: failed, ...children });
    expect(read).toMatchObject({ status: 'failed', error: { message: 'the model went away' } });
    expect(read.trace).toEqual(progress);
    expect(read.trace).toMatchObject({ bestIteration: 1, stopReason: null });
    // One that failed before its first iteration landed recorded nothing to keep.
    expect(
      roundtrip({ run: failed, criteria: children.criteria, iterations: [] }).trace,
    ).toBeNull();
  });

  it('[QL-23] an adopted iteration and where it came from round-trip unchanged', () => {
    const source = fullRecord({
      request: { ...fullRecord().request, adoptedFrom: { runId: 'earlier-quality', iteration: 2 } },
      trace: fullTrace({ iterations: [fullIteration({ mode: 'adopted' })] }),
    });
    const rows = toRows(source, () => 'iteration-1');
    expect(rows.iterations[0]?.row.mode).toBe('adopted');
    expect(roundtrip(rows)).toEqual(toRunDto(source));
    expect(roundtrip(rows).request.adoptedFrom).toEqual({ runId: 'earlier-quality', iteration: 2 });
  });

  it('[QL-13] keeps an escalated run honest: no criteria, no artifact, the diagnostics intact', () => {
    const source = fullRecord({
      llm: { model: 'test-model' },
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
                { stage: 'producer', sample: null, reason: 'llm-failed', detail: null },
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
      llm: { model: 'test-model' },
      parentRunId: null,
      recall: null,
    });
  });

  it('[QL-32] a recall and the lessons the producer saw round-trip unchanged; the list row keeps it without them', () => {
    const recall = recallOf(
      [
        {
          ref: 'm1',
          serves: 'the list read',
          insight: 'Own the store the list page reads from.',
          caveat: null,
          text: 'serve the list from a store the page owns',
          sourceRunId: 'earlier-quality',
        },
      ],
      'recall-quality',
    );
    const rows = toRows(fullRecord({ recall }));
    expect(rows.run.recall).toEqual(recall);
    expect(roundtrip(rows).recall).toEqual(recall);
    expect(roundtrip(rows)).toEqual(toRunDto(fullRecord({ recall })));
    expect(toSummary(rows.run, { iterations: 1, criteria: 2 }).recall).toEqual({
      status: 'recalled',
      reason: null,
      note: null,
      recallRunId: 'recall-quality',
      count: 1,
    });
    // Still recalling when the row was read: the marker round-trips too.
    expect(
      roundtrip(toRows(fullRecord({ status: 'running', recall: recallInProgress() }))).recall,
    ).toEqual(recallInProgress());
  });

  it('[QL-32] the run a run was opened for round-trips and is on its list row; a row from before the column reads as none', () => {
    const child = fullRecord({ parentRunId: '2026-09-05T23-59-59-000-def456-quality' });
    const rows = toRows(child);
    expect(rows.run.parentRunId).toBe('2026-09-05T23-59-59-000-def456-quality');
    expect(roundtrip(rows)).toEqual(toRunDto(child));
    expect(toSummary(rows.run, { iterations: 1, criteria: 2 }).parentRunId).toBe(
      '2026-09-05T23-59-59-000-def456-quality',
    );

    const { parentRunId: _absent, ...older } = toRows(fullRecord()).run;
    const olderRow = older as typeof rows.run;
    expect(roundtrip({ ...toRows(fullRecord()), run: olderRow }).parentRunId).toBeNull();
    expect(toSummary(olderRow, { iterations: 1, criteria: 2 }).parentRunId).toBeNull();
  });
});
