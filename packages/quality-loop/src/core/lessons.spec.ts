import { describe, expect, it } from 'vitest';

import type { IterationTrace } from '@sysdesign/contracts';
import { decide } from './decide';
import { deriveLessons } from './lessons';
import { normalize } from './normalize';
import {
  criterion,
  finding,
  reported,
  result,
  tinyPipeline,
  tinyPolicy,
  type TinyOutput,
} from './testing';

const contract = {
  ...tinyPipeline().task,
  goal: 'g',
  criteria: [criterion('c1'), criterion('c2', 'nice')],
};

function iteration(
  index: number,
  findings: ReturnType<typeof finding>[],
  results: ReturnType<typeof result>[],
): IterationTrace<TinyOutput> {
  const critics = [reported({ criticId: 'critic.tiny', sample: 1, findings })];
  const evaluators = [
    reported({ evaluatorId: 'evaluator.tiny', sample: 1, results, advisoryVerdict: null }),
  ];
  const ledger = normalize(
    {
      contract,
      artifactPresent: true,
      locations: [{ id: 'text', label: 'Text' }],
      validation: [],
      critics,
      evaluators,
      diagnostics: [],
    },
    tinyPolicy(),
  );
  return {
    iteration: index,
    mode: 'initial',
    artifact: { text: 't', parts: [] },
    locations: [],
    rendered: null,
    validation: [],
    critics,
    evaluators,
    ledger,
    decision: decide(ledger, tinyPolicy()),
    remediations: [],
    durationMs: 0,
  };
}

describe('deriveLessons', () => {
  it('[QL-10] tells persisted from resolved findings and improved from regressed criteria', () => {
    const lessons = deriveLessons([
      iteration(
        1,
        [finding(), finding({ type: 'wrong', locationRefs: [] })],
        [
          result({ criterionId: 'c1', result: 'fail' }),
          result({ criterionId: 'c2', result: 'pass' }),
        ],
      ),
      iteration(
        2,
        [finding()],
        [
          result({ criterionId: 'c1', result: 'pass' }),
          result({ criterionId: 'c2', result: 'partial' }),
        ],
      ),
    ]);
    expect(lessons).toEqual([
      expect.objectContaining({ kind: 'persisted', subject: 'gap|text', iterations: [1, 2] }),
      expect.objectContaining({ kind: 'resolved', subject: 'wrong|' }),
      expect.objectContaining({ kind: 'improved', subject: 'c1', detail: 'fail → pass' }),
      expect.objectContaining({ kind: 'regressed', subject: 'c2', detail: 'pass → partial' }),
    ]);
  });
});
