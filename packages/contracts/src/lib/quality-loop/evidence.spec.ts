import { sameRubric } from './evidence';

describe('sameRubric', () => {
  const rubric = [
    { id: 'C1', kind: 'coverage', statement: 'Names every store.' },
    { id: 'C2', kind: 'risk', statement: 'Says what fails first.' },
  ];

  it('holds for the same ids, kinds and statements in the same order', () => {
    const copy = rubric.map((criterion) => ({ ...criterion }));
    expect(sameRubric(rubric, copy)).toBe(true);
  });

  it('fails on any difference of length, order, id, kind or statement', () => {
    expect(sameRubric(rubric, rubric.slice(0, 1))).toBe(false);
    expect(sameRubric(rubric, [...rubric].reverse())).toBe(false);
    for (const field of ['id', 'kind', 'statement'] as const) {
      const changed = rubric.map((criterion, index) =>
        index === 1 ? { ...criterion, [field]: 'other' } : criterion,
      );
      expect(sameRubric(rubric, changed)).toBe(false);
    }
  });
});
