import type { QualityRunDto } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { sampleRun } from '../../../core/testing';
import { samplePack } from '../../../pipelines/memory-recall/testing';
import { MEMORY_HEADING } from '../../../orchestrators/memory/recall/inject';
import { faulting, readoutTrace } from '../../../orchestrators/memory/testing';
import { gapsOf, goalHashOf, standingGaps } from './gaps';

const BRIEF = '# Prompt — Serve an order history\n\nList past orders.';

/** A recall run whose pack names the gaps given, optionally with one of them faulted. */
const recallRun = (
  runId: string,
  gaps: string[],
  options: { faultedGap?: number; when?: string } = {},
): QualityRunDto => ({
  ...sampleRun(),
  runId,
  pipeline: 'memory-recall',
  parentRunId: 'coach-run',
  finishedAt: options.when ?? '2026-10-02T12:00:00.000Z',
  trace: readoutTrace({
    pipeline: 'memory-recall',
    goal: 'a query',
    artifact: samplePack({ gaps }),
    locations: ['summary', 'm1'],
    criteria: [{ id: 'c1', kind: 'need', statement: 'informs the read path' }],
    findings:
      options.faultedGap === undefined
        ? []
        : [faulting('missed_chunk', [`gap.${options.faultedGap}`])],
  }),
});

describe('what recalls could not serve', () => {
  it('[QL-45] a gap the pack named stands; one its own critics faulted does not', () => {
    expect(gapsOf(recallRun('r1', ['nothing covers the 150 reads/s target']))).toEqual([
      'nothing covers the 150 reads/s target',
    ]);
    // A gap a dropped candidate could have served is the pack's opinion, not the
    // store's shortcoming, and a finding at that place says so.
    expect(gapsOf(recallRun('r1', ['a', 'b'], { faultedGap: 1 }))).toEqual(['b']);
    // A run with no settled pack names nothing rather than guessing.
    expect(gapsOf({ ...sampleRun(), trace: null })).toEqual([]);
  });

  it('[QL-45] gaps group by the brief, most-named first, and the same prompt groups once', () => {
    const report = standingGaps(
      [
        {
          recall: recallRun('r1', ['alias uniqueness'], { when: '2026-10-02T10:00:00.000Z' }),
          goal: BRIEF,
        },
        {
          recall: recallRun('r2', ['alias uniqueness', 'redirect correctness'], {
            when: '2026-10-02T18:00:00.000Z',
          }),
          goal: BRIEF,
        },
        { recall: recallRun('r3', ['something else'], {}), goal: 'A different brief entirely.' },
      ],
      3,
    );
    expect(report.scanned).toBe(3);
    expect(report.unattributed).toBe(0);
    // Two groups, the one with more standing gaps first.
    expect(report.groups).toHaveLength(2);
    const [first] = report.groups;
    expect(first.goalHash).toBe(goalHashOf(BRIEF));
    expect(first.goalHead).toBe(BRIEF);
    expect(first.recalls).toBe(2);
    expect(first.gaps.map((gap) => [gap.text, gap.namedIn])).toEqual([
      ['alias uniqueness', ['r1', 'r2']],
      ['redirect correctness', ['r2']],
    ]);
    // First and last are when it was named, so a standing gap reads as standing.
    expect(first.gaps[0].first).toBe('2026-10-02T10:00:00.000Z');
    expect(first.gaps[0].last).toBe('2026-10-02T18:00:00.000Z');
  });

  it('[QL-45] the brief is taken bare, and a recall whose brief is unknown is counted', () => {
    const remembered = `${BRIEF}\n\n${MEMORY_HEADING}\n\n- [m1] a lesson appended by an earlier run`;
    // A brief recalled for twice groups once, whatever memory was appended to it.
    expect(goalHashOf(remembered)).toBe(goalHashOf(BRIEF));

    const report = standingGaps(
      [
        { recall: recallRun('r1', ['alias uniqueness']), goal: remembered },
        { recall: recallRun('r2', ['alias uniqueness']), goal: BRIEF },
        { recall: recallRun('r3', ['orphaned']), goal: null },
      ],
      3,
    );
    expect(report.unattributed).toBe(1);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].gaps[0].namedIn).toEqual(['r1', 'r2']);
  });
});
