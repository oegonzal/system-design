/**
 * The guard on every future change to how a wave is scheduled.
 *
 * Today a wave runs its lenses concurrently and each lens runs its own samples
 * one after another, so declaration order survives by accident of the loop
 * shape. These specs assert it as a property instead, because three things
 * downstream read array order rather than ids: `lensOrder` sorts the lenses on
 * a confirmed finding, `annotate` picks a finding's rationale with a
 * first-match `find`, and that rationale rides a remediation into the next
 * iteration's producer prompt. Reassemble a wave by completion order and the
 * grade moves.
 */
import type { CriticReport, RawFinding } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { Critic } from '../ports';
import {
  finding,
  reported,
  scriptedStages,
  tinyPipeline,
  tinyPolicy,
  type TinyOutput,
} from '../testing';
import { runLoop } from './run-pipeline';

const clock = () => 0;

/** The same defect from every lens and sample, so one group forms and its order is visible. */
const sameDefect = (rationale: string): RawFinding =>
  finding({ criterionIds: ['c1'], locationRefs: ['text'], rationale });

/**
 * A lens whose samples answer after `settleAfter` turns of the microtask queue.
 * A larger number finishes later, so a descending list inverts completion
 * against declaration.
 */
const delayed = (id: string, settleAfter: number): Critic<TinyOutput> => ({
  id,
  consumes: [],
  run: async () => {
    for (let turn = 0; turn < settleAfter; turn += 1) await Promise.resolve();
    return [1, 2].map((sample) =>
      reported<CriticReport>({
        criticId: id,
        sample,
        findings: [sameDefect(`${id} sample ${sample} says so`)],
      }),
    );
  },
});

/** Three lenses, two samples each, one shared defect; `order` decides who answers first. */
const pipeline = () =>
  tinyPipeline({
    critics: ['critic.a', 'critic.b', 'critic.c'].map((id) => ({
      id,
      persona: 'You find gaps.',
      samples: 2,
      maxItems: 4,
      maxTokens: 500,
      consumes: [],
    })),
    evaluators: [],
    policy: { ...tinyPolicy(), evidence: { minHits: 2, minAssessedShare: 0 } },
  });

const runWith = (settleAfter: Record<string, number>) =>
  runLoop(
    scriptedStages({
      critics: Object.entries(settleAfter).map(([id, turns]) => delayed(id, turns)),
      evaluators: [],
    }),
    pipeline(),
    { goal: 'g', maxIterations: 1 },
    clock,
  );

// Declared a, b, c. Completion c, b, a.
const INVERTED = { 'critic.a': 6, 'critic.b': 4, 'critic.c': 2 };
const FORWARD = { 'critic.a': 2, 'critic.b': 4, 'critic.c': 6 };

describe('a wave of lenses', () => {
  it('[QL-26] reports arrive by declaration order and ascending sample, whatever answered first', async () => {
    const trace = await runWith(INVERTED);
    const [only] = trace.iterations;

    expect(only.critics.map((outcome) => outcome.report?.criticId)).toEqual([
      'critic.a',
      'critic.a',
      'critic.b',
      'critic.b',
      'critic.c',
      'critic.c',
    ]);
    expect(only.critics.map((outcome) => outcome.report?.sample)).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('[QL-26] the lenses on a confirmed finding, and the rationale it carries, follow declaration order', async () => {
    const [confirmed] = (await runWith(INVERTED)).iterations[0].ledger.findings;

    expect(confirmed.lenses).toEqual(['critic.a', 'critic.b', 'critic.c']);
    // The first declaring lens speaks for the group — not the first to answer,
    // which here is `critic.c`.
    expect(confirmed.rationale).toBe('critic.a sample 1 says so');
  });

  it('[QL-26] the whole ledger is identical under inverted and forward completion', async () => {
    const [inverted, forward] = await Promise.all([runWith(INVERTED), runWith(FORWARD)]);

    expect(inverted.iterations[0].ledger).toEqual(forward.iterations[0].ledger);
    expect(inverted.iterations[0].decision).toEqual(forward.iterations[0].decision);
    expect(inverted.finalDecision).toBe(forward.finalDecision);
  });

  it('[QL-26] a sample keeps its planned number, so agreement across samples is unchanged', async () => {
    const [confirmed] = (await runWith(INVERTED)).iterations[0].ledger.findings;

    // Two samples of each of three lenses saw it; with minHits 2 every lens
    // confirms, which is only true because the two samples kept numbers 1 and 2.
    expect(confirmed.hits).toBe(6);
  });
});
