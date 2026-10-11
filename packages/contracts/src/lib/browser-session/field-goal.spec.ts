import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GoalBudgetExceeded } from '../quality-loop/goal-index';
import { evidenceAlias, fieldAnswersSchema, FIELDS_BOUND } from './field-answers.schema';
import {
  composeFieldGoal,
  FIELD_EVIDENCE_HEADING,
  fieldIndexSchemaFor,
  FIELDS_HEADING,
  fieldSpecOf,
  readFieldIndex,
  splitFieldGoal,
  valueFaults,
  type EvidenceItem,
} from './field-goal';
import { formObservation } from './fixtures';
import { readFencedIndex } from '../quality-loop/goal-index';

const fields = () =>
  formObservation()
    .elements.filter((element) => element.kind !== 'clickable')
    .map(fieldSpecOf);

const evidence = (): EvidenceItem[] => [
  {
    alias: evidenceAlias(0),
    text: 'Alex Example has 6 years of professional Python, 2020–2026.',
    when: '2026-10-02',
    source: { runId: 'run-1', pipeline: 'document-digest', ref: 'memory.1', kind: 'profile_fact' },
  },
];

const PROSE =
  '# Mission\n\nAnswer only from evidence.\n\n## Unit of work\n\nSenior Engineer at Acme';

describe('composeFieldGoal', () => {
  it('[QL-39] lists every field in the index with the facts a validator needs, and no evidence until recalled', () => {
    const goal = composeFieldGoal({
      pipeline: 'field-answer',
      prose: PROSE,
      fields: fields(),
      evidence: [],
    });
    const index = readFieldIndex(goal);
    expect(index?.pipeline).toBe('field-answer');
    expect(index?.fields.map((f) => f.ref)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(index?.fields[2].hiddenTraits).toEqual(['offscreen', 'autocomplete-off-bait']);
    expect(index?.evidence).toEqual([]);
    expect(goal).toContain('(none recalled:');
  });

  it('[QL-39] splits and composes again with evidence, and the split is the same the second time', () => {
    const bare = composeFieldGoal({
      pipeline: 'answer-suggestions',
      prose: PROSE,
      fields: fields(),
      evidence: [],
    });
    const split = splitFieldGoal(bare);
    expect(split?.pipeline).toBe('answer-suggestions');
    expect(split?.prose).toBe(PROSE);
    expect(split?.fields).toEqual(fields());
    expect(bare).toContain('(none recalled: no suggestion rests on the record;');

    if (split === null) throw new Error('the composed goal must split');
    const recalled = composeFieldGoal({ ...split, evidence: evidence() });
    expect(readFieldIndex(recalled)?.evidence).toEqual([{ alias: 'm1' }]);
    // Each item says what the store holds it as, under one legend of the kinds.
    expect(recalled).toContain(
      `${FIELD_EVIDENCE_HEADING}\n\nKinds: profile_fact — one thing true of the subject`,
    );
    expect(recalled).toContain('\n\n- [m1] profile_fact — Alex Example has 6 years');
    expect(splitFieldGoal(recalled)).toEqual(split);
    // Each pipeline's own index reader takes its own goals only.
    expect(readFencedIndex(recalled, fieldIndexSchemaFor('answer-suggestions'))).not.toBeNull();
    expect(readFencedIndex(recalled, fieldIndexSchemaFor('field-answer'))).toBeNull();
  });

  it('[QL-39] states once what a value does that its field cannot take, whoever writes it', () => {
    const [years, auth, hidden] = fields();
    expect(valueFaults(years, 'six')).toEqual([
      { severity: 'medium', message: 'e1 takes a number; "six" is not one' },
    ]);
    expect(valueFaults(auth, 'Maybe')).toEqual([
      { severity: 'medium', message: '"Maybe" is not an option of e2' },
    ]);
    expect(valueFaults({ ...auth, optionsOmitted: 3 }, 'Maybe')).toEqual([]);
    expect(valueFaults({ ...years, maxLength: 1 }, '12')).toEqual([
      { severity: 'medium', message: 'e1 takes at most 1 characters; the value runs to 2' },
    ]);
    expect(valueFaults(hidden, 'x')[0]?.severity).toBe('high');
  });

  it('[QL-39] finds its own fields heading even when the prose uses the same words', () => {
    const prose = `${PROSE}\n\n${FIELDS_HEADING}\n\nThe mission mentions this heading in passing.`;
    const split = splitFieldGoal(
      composeFieldGoal({ pipeline: 'field-answer', prose, fields: fields(), evidence: [] }),
    );
    expect(split?.prose).toBe(prose);
  });

  it('[QL-39] refuses a goal that would not fit the engine budget', () => {
    const many = Array.from({ length: FIELDS_BOUND.target }, (_, i) => ({
      ...fields()[0],
      ref: `e${i + 1}`,
      options: Array.from({ length: 60 }, () => 'o'.repeat(200)),
    }));
    expect(() =>
      composeFieldGoal({ pipeline: 'field-answer', prose: PROSE, fields: many, evidence: [] }),
    ).toThrow(GoalBudgetExceeded);
  });

  it('[QL-39] prints what a field holds, the page’s invalid mark, and how many options the page offers past the listed ones', () => {
    const [years, auth] = fields();
    const goal = composeFieldGoal({
      pipeline: 'field-answer',
      prose: PROSE,
      fields: [
        { ...years, value: '6', invalid: true },
        { ...auth, optionsOmitted: 4 },
      ],
      evidence: [],
    });
    expect(goal).toContain(
      '- e1 · textbox "Years of experience with Python" · type number · holds "6" now · required · marked invalid by the page',
    );
    expect(goal).toContain('options: Yes | No (4 more the page offers)');
    expect(
      readFieldIndex(goal)?.fields.map((field) => [
        field.value,
        field.invalid,
        field.optionsOmitted,
      ]),
    ).toEqual([
      ['6', true, 0],
      [null, false, 4],
    ]);
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
