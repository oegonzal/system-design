import { describe, expect, it } from 'vitest';

import { rubricProblems } from './rubric';
import { criterion, tinyPipeline } from '../testing';

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
});
