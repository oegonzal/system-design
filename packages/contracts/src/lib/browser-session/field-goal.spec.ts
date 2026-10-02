import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GoalBudgetExceeded } from '../quality-loop/goal-index';
import { evidenceAlias, fieldAnswersSchema, MAX_FIELDS } from './field-answers.schema';
import {
  composeFieldGoal,
  FIELD_EVIDENCE_HEADING,
  FIELDS_HEADING,
  fieldSpecOf,
  readFieldIndex,
  splitFieldGoal,
  type EvidenceItem,
} from './field-goal';
import { formObservation } from './fixtures';

const fields = () =>
  formObservation()
    .elements.filter((element) => element.kind !== 'clickable')
    .map(fieldSpecOf);

const evidence = (): EvidenceItem[] => [
  {
    alias: evidenceAlias(0),
    text: 'Alex Example has 6 years of professional Python, 2020–2026.',
    when: '2026-10-02',
    source: { runId: 'run-1', pipeline: 'document-digest', ref: 'memory.1' },
  },
];

const PROSE =
  '# Mission\n\nAnswer only from evidence.\n\n## Unit of work\n\nSenior Engineer at Acme';

describe('composeFieldGoal', () => {
  it('[QL-39] lists every field in the index with the facts a validator needs, and no evidence until recalled', () => {
    const goal = composeFieldGoal({ prose: PROSE, fields: fields(), evidence: [] });
    const index = readFieldIndex(goal);
    expect(index?.pipeline).toBe('field-answer');
    expect(index?.fields.map((f) => f.ref)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(index?.fields[2].hiddenTraits).toEqual(['offscreen', 'autocomplete-off-bait']);
    expect(index?.evidence).toEqual([]);
    expect(goal).toContain('(none recalled:');
  });

  it('[QL-39] splits and composes again with evidence, and the split is the same the second time', () => {
    const bare = composeFieldGoal({ prose: PROSE, fields: fields(), evidence: [] });
    const split = splitFieldGoal(bare);
    expect(split?.prose).toBe(PROSE);
    expect(split?.fields).toEqual(fields());

    const recalled = composeFieldGoal({
      prose: split!.prose,
      fields: split!.fields,
      evidence: evidence(),
    });
    expect(readFieldIndex(recalled)?.evidence).toEqual([{ alias: 'm1' }]);
    expect(recalled).toContain(`${FIELD_EVIDENCE_HEADING}\n\n- [m1] Alex Example has 6 years`);
    expect(splitFieldGoal(recalled)).toEqual(split);
  });

  it('[QL-39] finds its own fields heading even when the prose uses the same words', () => {
    const prose = `${PROSE}\n\n${FIELDS_HEADING}\n\nThe mission mentions this heading in passing.`;
    const split = splitFieldGoal(composeFieldGoal({ prose, fields: fields(), evidence: [] }));
    expect(split?.prose).toBe(prose);
  });

  it('[QL-39] refuses a goal that would not fit the engine budget', () => {
    const many = Array.from({ length: MAX_FIELDS }, (_, i) => ({
      ...fields()[0],
      ref: `e${i + 1}`,
      options: Array.from({ length: 60 }, () => 'o'.repeat(200)),
    }));
    expect(() => composeFieldGoal({ prose: PROSE, fields: many, evidence: [] })).toThrow(
      GoalBudgetExceeded,
    );
  });

  it('returns null for a goal this codec did not write', () => {
    expect(splitFieldGoal('# Something else')).toBeNull();
  });
});

describe('fieldAnswersSchema', () => {
  it('[QL-37] converts to JSON Schema with no number a model writes, and tells the model the rules', () => {
    const json = JSON.stringify(z.toJSONSchema(fieldAnswersSchema));
    expect(json).not.toMatch(/"type":"(number|integer)"/);
    for (const rule of [
      'Every field the Fields list names, exactly once, in the order listed.',
      'null unless the decision is answer',
      'exactly as listed; empty when none supports it',
    ]) {
      expect(json, `the model is never told: ${rule}`).toContain(rule);
    }
  });
});
