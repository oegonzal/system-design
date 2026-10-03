import { describe, expect, it } from 'vitest';

import { bound, CUT_FACTOR, CUT_MARKER, cutPoint, keptAtMost } from '@sysdesign/contracts';

import { criterionLengthBound } from '../contracts';
import { createCriteriaDeriver } from '../stages/derive-criteria';
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

  it('[QL-20] [QL-47] holds a supplied statement to the longest the pipeline’s own deriver can return', () => {
    const limit = keptAtMost(criterionLengthBound(task));
    const long = criterion('c1', 'must', 'x'.repeat(limit + 1));
    expect(rubricProblems([long, criterion('c2')], task)).toEqual([
      `criterion c1 is longer than the ${limit} characters this pipeline allows`,
    ]);
    expect(rubricProblems([long], { ...task, statementBound: bound(limit) })).toEqual([]);
  });

  it('[QL-47] accepts back any rubric its deriver can return — from the target to the longest it keeps, and one it cut', async () => {
    const statementBound = criterionLengthBound(task);
    const { target, ceiling } = statementBound;
    const lengths = [
      target,
      ceiling,
      ceiling + 1,
      cutPoint(statementBound),
      keptAtMost(statementBound),
      CUT_FACTOR * keptAtMost(statementBound),
    ];
    expect(lengths.length).toBeLessThanOrEqual(task.maxCriteria);
    const words = (length: number): string =>
      'every request is answered from the replica nearest the caller '
        .repeat(length)
        .slice(0, length);
    const derived = await createCriteriaDeriver(
      task,
      tinyPipeline().deriveCriteria,
      fakeLlm({ criteria: lengths.map((length) => ({ kind: 'must', statement: words(length) })) }),
    )('goal');
    const rubric = derived.criteria ?? [];
    expect(rubric).toHaveLength(lengths.length);
    // The longest was cut, with the marker, and is still a statement the deriver returned.
    expect(rubric[rubric.length - 1].statement.endsWith(CUT_MARKER)).toBe(true);
    expect(Math.max(...rubric.map((item) => item.statement.length))).toBeGreaterThan(ceiling);
    expect(rubricProblems(rubric, task)).toEqual([]);
    // Supplied back, it runs, with every statement past the target an overrun on the record.
    const trace = await runLoop(
      scriptedStages(),
      tinyPipeline(),
      { goal: 'g', criteria: rubric, maxIterations: 1 },
      clock,
    );
    expect(trace.contract.criteria).toEqual(rubric);
    expect(
      trace.iterations[0].ledger.diagnostics.filter(
        (diagnostic) => diagnostic.reason === 'overrun',
      ),
    ).toHaveLength(lengths.filter((length) => length > target).length);
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
