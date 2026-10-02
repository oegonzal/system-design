import type { RunTrace } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { outputsOf } from '../../../core/outputs';
import { fromRun } from '../../../pipelines/experience-digest/from-run';
import { renderGoal as renderRecord } from '../../../pipelines/experience-digest/input';
import { sampleDigest, sampleRun } from '../../../pipelines/experience-digest/testing';
import { ACCEPT_AT, digestInput, faulting, readoutTrace } from '../testing';
import { memoriesToStore as memoriesOf } from './read-digest';

// The reader takes a run's outputs; these specs build traces, so read through the view.
const memoriesToStore = (trace: RunTrace, acceptAt: number) =>
  memoriesOf(outputsOf(trace), acceptAt);

const composedGoal = (): string => {
  const record = fromRun(sampleRun());
  if (record === null) throw new Error('the sample run must compose');
  return renderRecord(record);
};

describe('reading a digest', () => {
  it('[QL-16] an accepted digest endorses memories no finding names, with evidence resolved through its own index', () => {
    const goal = composedGoal();
    const digest = sampleDigest({
      memories: [
        ...sampleDigest().memories,
        {
          evidence: ['f2'],
          insight: 'Name the fix for a contradiction or escalate it.',
          appliesWhen: 'a critic finds two parts that cannot both hold',
        },
      ],
      unused: ['r2'],
    });
    const trace = readoutTrace({
      ...digestInput(digest, goal),
      locations: ['summary', 'memory.1', 'memory.2', 'r2'],
      findings: [faulting('run_specific', ['memory.2'])],
    });
    expect(memoriesToStore(trace, ACCEPT_AT)).toEqual({
      admission: 'admitted',
      proposed: 2,
      memories: [
        {
          position: 1,
          insight: digest.memories[0].insight,
          appliesWhen: digest.memories[0].appliesWhen,
          evidence: [
            { kind: 'finding', ref: 'unhandled_failure|flow.1' },
            { kind: 'criterion', ref: 'c1' },
          ],
        },
      ],
    });
    const belowTheBar = readoutTrace({
      ...digestInput(digest, goal),
      decision: 'revise',
      overall: 50,
    });
    expect(memoriesToStore(belowTheBar, ACCEPT_AT)).toEqual({
      admission: 'fell-short',
      proposed: 2,
      memories: [],
    });
  });

  it('[QL-16] a digest judged against no rubric proposes its memories and endorses none, and says it was not judged', () => {
    const digest = sampleDigest();
    const unjudged = readoutTrace({
      ...digestInput(digest, composedGoal()),
      decision: 'escalate',
      overall: 0,
      criteria: [],
    });
    expect(memoriesToStore(unjudged, ACCEPT_AT)).toEqual({
      admission: 'no-rubric',
      proposed: digest.memories.length,
      memories: [],
    });
  });

  it('[QL-16] a blocker on the summary withholds the summary, not the memories under it', () => {
    // The live failure this rule exists for: a digest scored 94, ended
    // `revise` on an open `misattributed_evidence` naming only the summary,
    // and eight clean memories were thrown away with it.
    const digest = sampleDigest();
    const faultedSummary = readoutTrace({
      ...digestInput(digest, composedGoal()),
      decision: 'revise',
      overall: 94,
      policyAllowed: false,
      findings: [faulting('misattributed_evidence', ['summary'])],
    });

    const readout = memoriesToStore(faultedSummary, ACCEPT_AT);

    expect(readout.admission).toBe('admitted');
    expect(readout.memories.map((memory) => memory.position)).toEqual([1]);
  });
});
