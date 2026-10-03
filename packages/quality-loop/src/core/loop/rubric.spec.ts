import { describe, expect, it } from 'vitest';

import { bound } from '@sysdesign/contracts';

import { criterionLengthBound } from '../contracts';
import type { Stages } from '../ports';
import {
  criterion,
  fakeLlm,
  finding,
  result,
  scriptedCritic,
  scriptedEvaluator,
  scriptedStages,
  tinyPipeline,
  type TinyOutput,
} from '../testing';
import { rubricProblems } from './rubric';
import { runLoop, runPipeline } from './run-pipeline';

const clock = () => 0;

describe('rubricProblems', () => {
  const task = tinyPipeline().task;

  it('[QL-20] accepts a rubric the task could have derived', () => {
    expect(rubricProblems([criterion('c1'), criterion('c2', 'nice')], task)).toEqual([]);
  });

  it('names an empty rubric, a duplicate id, an unpriced kind and an over-long rubric', () => {
    expect(rubricProblems([], task)).toEqual(['a rubric needs at least one criterion']);
    expect(rubricProblems([criterion('c1'), criterion('c1')], task)).toEqual([
      'duplicate criterion id: c1',
    ]);
    expect(rubricProblems([{ id: 'c1', kind: 'bogus', statement: 's' }], task)).toEqual([
      `criterion c1 has kind bogus; this pipeline prices ${Object.keys(task.criterionKinds).join(', ')}`,
    ]);
    const many = Array.from({ length: task.maxCriteria + 1 }, (_, i) => criterion(`c${i + 1}`));
    expect(rubricProblems(many, task)).toEqual([
      `${many.length} criteria supplied; this pipeline allows ${task.maxCriteria}`,
    ]);
  });

  it('[QL-20] holds a supplied statement to the ceiling the pipeline’s own deriver is accepted with', () => {
    const { ceiling } = criterionLengthBound(task);
    const long = criterion('c1', 'must', 'x'.repeat(ceiling + 1));
    expect(rubricProblems([long, criterion('c2')], task)).toEqual([
      `criterion c1 is longer than the ${ceiling} characters this pipeline allows`,
    ]);
    expect(rubricProblems([long], { ...task, statementBound: bound(ceiling + 1) })).toEqual([]);
  });
});

describe('a supplied rubric', () => {
  const rubric = [criterion('req-1'), criterion('nfr-1', 'nice')];

  it('[QL-20] is used verbatim and the deriver is never asked', async () => {
    let derivations = 0;
    const counting: Stages<TinyOutput>['deriveCriteria'] = () => {
      derivations += 1;
      return Promise.resolve({ criteria: [criterion('c1')], diagnostic: null, overruns: [] });
    };
    const trace = await runLoop(
      scriptedStages({
        deriveCriteria: counting,
        critics: [
          scriptedCritic('critic.tiny', [
            [[finding({ criterionIds: ['req-1'], rationale: 'the text is thin' })]],
          ]),
        ],
        evaluators: [
          scriptedEvaluator('evaluator.tiny', [
            [
              [
                result({ criterionId: 'req-1', result: 'partial' }),
                result({ criterionId: 'nfr-1' }),
              ],
            ],
          ]),
        ],
      }),
      tinyPipeline(),
      { goal: 'g', criteria: rubric, maxIterations: 1 },
      clock,
    );
    expect(derivations).toBe(0);
    expect(trace.contract.criteria).toEqual(rubric);
    const [iteration] = trace.iterations;
    expect(iteration.ledger.criteria.map((evidence) => evidence.criterionId)).toEqual([
      'req-1',
      'nfr-1',
    ]);
    expect(iteration.ledger.diagnostics.map((diagnostic) => diagnostic.stage)).not.toContain(
      'criteria',
    );
    // The ledger carries the critic's words for a reader; the decision never read them.
    expect(iteration.ledger.findings[0]).toMatchObject({
      criterionIds: ['req-1'],
      rationale: 'the text is thin',
    });
  });

  it('[QL-20] is refused before any stage runs when it does not fit the pipeline', async () => {
    await expect(
      runPipeline(
        tinyPipeline(),
        { goal: 'g', criteria: [{ id: 'c1', kind: 'bogus', statement: 's' }] },
        { llm: fakeLlm(), sink: () => undefined, now: clock },
      ),
    ).rejects.toThrow(/rubric rejected: criterion c1 has kind bogus/);
  });
});
