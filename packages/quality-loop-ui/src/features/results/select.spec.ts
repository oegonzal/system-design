import { describe, expect, it } from 'vitest';

import { makeIteration, makeRun } from '../../testing/fixtures';
import { criteriaRows, dimensionRows, findingGroups, subjectLabel } from './select';

describe('criteriaRows', () => {
  it('[QLU-3] joins the contract to the ledger by id in contract order, unassessed where nothing judged', () => {
    const run = makeRun();
    const iteration = run.trace?.iterations[0];
    if (!run.trace || !iteration) throw new Error('fixture has no trace');

    const rows = criteriaRows(
      [...run.trace.contract.criteria, { id: 'c9', kind: 'scale', statement: 'never judged' }],
      iteration.ledger.criteria,
    );

    expect(rows.map((row) => [row.id, row.result, row.hits])).toEqual([
      ['c1', 'pass', 1],
      ['c2', 'fail', 1],
      ['c9', 'unassessed', 0],
    ]);
    expect(rows[0]?.statement).toContain('one Order History list');
    expect(rows[2]).toMatchObject({ confidence: null, locationRefs: [] });
  });
});

describe('findingGroups', () => {
  it('[QLU-3] attaches the selected remediation note by key and groups worst severity first', () => {
    const iteration = makeIteration();

    const groups = findingGroups(iteration.ledger.findings, iteration.remediations);

    expect(groups.map((group) => group.severity)).toEqual(['high', 'medium']);
    expect(groups[0]?.findings[0]).toMatchObject({
      key: 'missing_requirement|component.2',
      note: null,
      action: null,
      reconciledTo: 'c2',
    });
    expect(groups[1]?.findings[0]).toMatchObject({
      key: 'unsupported_claim|summary',
      note: 'The summary promises sub-second freshness the design never shows.',
      action: 'revise',
    });
  });

  it('drops empty severity groups and lets the first remediation for a key win', () => {
    const iteration = makeIteration();
    const first = iteration.remediations.find((remediation) => 'finding' in remediation.subject);
    if (!first) throw new Error('fixture has no finding remediation');

    const groups = findingGroups(iteration.ledger.findings, [
      first,
      { ...first, note: 'a later duplicate' },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[1]?.findings[0]?.note).toBe(first.note);
    expect(findingGroups([], [])).toEqual([]);
  });
});

describe('dimensionRows and subjectLabel', () => {
  it('reads the dimensions straight off the decision trace', () => {
    const rows = dimensionRows(makeIteration().decision);
    expect(rows).toEqual([
      { dimension: 'completeness', score: 50, weight: 0.6, penaltyTotal: 0 },
      { dimension: 'soundness', score: 88, weight: 0.4, penaltyTotal: 12 },
    ]);
  });

  it('names a remediation subject by its kind', () => {
    expect(subjectLabel({ finding: 'f' })).toBe('finding f');
    expect(subjectLabel({ criterion: 'c1' })).toBe('criterion c1');
    expect(subjectLabel({ validator: 'schema' })).toBe('validator schema');
  });
});
