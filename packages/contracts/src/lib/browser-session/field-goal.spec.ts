import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DOCUMENT_MEMORY_LEGEND, renderDocumentGoal } from '../quality-loop/document-digest';
import { GoalBudgetExceeded } from '../quality-loop/goal-index';
import { SOURCE_ID_MAX_LENGTH, SOURCE_REF_MAX_LENGTH } from '../quality-loop/memory';
import { evidenceAlias, fieldAnswersSchema, FIELDS_BOUND } from './field-answers.schema';
import {
  closedOptionsOf,
  composeFieldGoal,
  EVIDENCE_TEXT_MAX_LENGTH,
  evidenceText,
  FIELD_EVIDENCE_HEADING,
  fieldIndexSchemaFor,
  FIELDS_HEADING,
  fieldSpecOf,
  fieldTypeOf,
  readEvidenceItems,
  readFieldIndex,
  splitFieldGoal,
  valueFaults,
  type EvidenceItem,
  type FieldGoalInput,
} from './field-goal';
import { unitNamedLegend } from './field-goal-terms';
import { formObservation, resumeChunk } from './fixtures';
import { readFencedIndex, stripIndexSection } from '../quality-loop/goal-index';

const fields = () =>
  formObservation()
    .elements.filter((element) => element.kind !== 'clickable')
    .map(fieldSpecOf);

const evidence = (): EvidenceItem[] => [
  {
    alias: evidenceAlias(0),
    text: 'Alex Example has 6 years of professional Python, 2020–2026.',
    when: '2026-10-02',
    scope: 'subject',
    kind: 'profile_fact',
    source: { origin: 'document-digest', ref: 'run-1#memory.1' },
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
      kinds: [],
    });
    const index = readFieldIndex(goal);
    expect(index?.pipeline).toBe('field-answer');
    expect(index?.fields.map((f) => f.ref)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(index?.fields[2].hiddenTraits).toEqual(['offscreen', 'autocomplete-off-bait']);
    expect(index?.evidence).toEqual([]);
    expect(goal).toContain('(none recalled:');
  });

  it('[QL-39] splits and composes again with evidence under the legend of the kinds declared, and the split is the same the second time', () => {
    const bare = composeFieldGoal({
      pipeline: 'answer-suggestions',
      prose: PROSE,
      fields: fields(),
      evidence: [],
      kinds: [],
    });
    const split = splitFieldGoal(bare);
    expect(split?.pipeline).toBe('answer-suggestions');
    expect(split?.prose).toBe(PROSE);
    expect(split?.fields).toEqual(fields());
    expect(bare).toContain('(none recalled: no suggestion rests on the record;');

    if (split === null) throw new Error('the composed goal must split');
    const recalled = composeFieldGoal({
      ...split,
      evidence: evidence(),
      kinds: DOCUMENT_MEMORY_LEGEND,
    });
    expect(readFieldIndex(recalled)?.evidence).toEqual([{ alias: 'm1' }]);
    // Each item says what the store holds it as and where it holds, under one legend of the kinds — the composer's data, never read off the items — and one of the scopes.
    expect(recalled).toContain(
      `${FIELD_EVIDENCE_HEADING}\n\nKinds: profile_fact — one thing true of the subject that a field could take or compute from; profile_story — a course of events`,
    );
    expect(recalled).toContain(
      '\nScopes: subject — true of the subject wherever asked — the answer is the same whoever asks: their record, their experience, skills, documents, links, status or availability, or their standing answer to a question any form may ask, however the form was asked for one role; unit — ',
    );
    expect(recalled).toContain('\n\n- [m1] profile_fact · subject — Alex Example has 6 years');
    // The split carries neither the evidence nor the legend: both are the recall's to compose.
    expect(splitFieldGoal(recalled)).toEqual(split);
    // Each pipeline's own index reader takes its own goals only.
    expect(readFencedIndex(recalled, fieldIndexSchemaFor('answer-suggestions'))).not.toBeNull();
    expect(readFencedIndex(recalled, fieldIndexSchemaFor('field-answer'))).toBeNull();
  });

  it('[QL-39] reads its evidence back from the goal it wrote — the inverse of the line each item is listed on — a text holding the separators and the tail’s own words included, admits only what reads back, lists no item of a kind the legend leaves out, and refuses an index listing items over no section', () => {
    const storedFact: EvidenceItem = {
      alias: 'm1',
      text: 'Alex Example — "stored" at Acme · 2020–2026 · stored 2021 · a b',
      when: '2026-10-02',
      scope: 'subject',
      kind: 'profile_fact',
      source: { origin: 'document-digest', ref: 'run-1#memory.1' },
    };
    const taughtAnswer: EvidenceItem = {
      alias: 'm2',
      text: 'Asked "Do you know anyone here?", Alex Example answered "No".',
      when: '2026-10-20',
      scope: 'unit',
      kind: 'standing_answer',
      source: { origin: 'operator:form', ref: '0191e4b2-7c1a-4f0e-9d3b-5a6c7d8e9f00@v3' },
    };
    const input: FieldGoalInput = {
      pipeline: 'field-answer',
      prose: PROSE,
      fields: fields(),
      evidence: [storedFact, taughtAnswer],
      kinds: [
        ...DOCUMENT_MEMORY_LEGEND,
        { kind: 'standing_answer', use: 'the subject’s own answer to a question a form asked' },
      ],
      unitKey: 'company=acme',
    };
    const goal = composeFieldGoal(input);
    expect(goal).toContain(
      '; standing_answer — the subject’s own answer to a question a form asked.\nScopes: ',
    );
    expect(goal).toContain(
      '\n- [m1] profile_fact · subject — Alex Example — "stored" at Acme · 2020–2026 · stored 2021 · a b · stored 2026-10-02 · document-digest run-1#memory.1\n',
    );
    expect(goal).toContain(
      '\n- [m2] standing_answer · unit — Asked "Do you know anyone here?", Alex Example answered "No". · stored 2026-10-20 · operator:form 0191e4b2-7c1a-4f0e-9d3b-5a6c7d8e9f00@v3\n\n## Limits\n',
    );
    expect(readEvidenceItems(goal)).toEqual([storedFact, taughtAnswer]);
    // The index lists the aliases alone, as it did: the validators read what they read before.
    expect(readFieldIndex(goal)?.evidence).toEqual([{ alias: 'm1' }, { alias: 'm2' }]);
    // Nothing listed reads as nothing, and so does a goal this codec did not write.
    expect(readEvidenceItems(composeFieldGoal({ ...input, evidence: [], kinds: [] }))).toEqual([]);
    expect(readEvidenceItems(renderDocumentGoal(resumeChunk()))).toEqual([]);
    expect(readEvidenceItems('# Something else')).toEqual([]);
    // A kind the legend leaves out is refused by name, as is an item the schema does not admit: a text over two lines, a ref of two words.
    expect(() => composeFieldGoal({ ...input, kinds: DOCUMENT_MEMORY_LEGEND })).toThrow(
      'evidence m2 is of a kind the legend does not list: standing_answer',
    );
    expect(() =>
      composeFieldGoal({ ...input, evidence: [{ ...storedFact, text: 'two\nlines' }] }),
    ).toThrow('evidence m1 is not an item the goal lists');
    expect(() =>
      composeFieldGoal({
        ...input,
        evidence: [{ ...storedFact, source: { origin: 'document-digest', ref: 'run 1' } }],
      }),
    ).toThrow('evidence m1 is not an item the goal lists');
    // The write side admits exactly what the read side reads: no line terminator `.` stops at, in the text, the kind or the when.
    for (const broken of [
      { ...storedFact, text: 'two\u2028lines' },
      { ...storedFact, kind: 'profile\nfact' },
      { ...storedFact, when: '2026-10\r02' },
    ]) {
      expect(() => composeFieldGoal({ ...input, evidence: [broken] })).toThrow(
        'evidence m1 is not an item the goal lists',
      );
    }
    // The legend is admitted line by line too: a use over two lines would read as an item, or end the section.
    expect(() =>
      composeFieldGoal({
        ...input,
        kinds: [...DOCUMENT_MEMORY_LEGEND, { kind: 'standing_answer', use: 'an answer\n- or two' }],
      }),
    ).toThrow('the kinds legend is not one the goal lists');
    // An address as long as its origin's declared parts compose is admitted, and read back.
    const farthest: EvidenceItem = {
      ...storedFact,
      source: {
        origin: 'document-digest',
        ref: `${'r'.repeat(SOURCE_ID_MAX_LENGTH)}#${'m'.repeat(SOURCE_REF_MAX_LENGTH)}`,
      },
    };
    expect(readEvidenceItems(composeFieldGoal({ ...input, evidence: [farthest] }))).toEqual([
      farthest,
    ]);
    // The lines are read against the index, never half read, and a line of another shape — the tail an earlier codec wrote, say — is refused by name.
    expect(() =>
      readEvidenceItems(goal.replace('- [m2] standing_answer', '- [m3] standing_answer')),
    ).toThrow('the evidence lines read "m1 m3" where the index lists "m1 m2"');
    expect(() =>
      readEvidenceItems(
        goal.replace(
          ' · document-digest run-1#memory.1',
          ' · document-digest memory.1 (run run-1)',
        ),
      ),
    ).toThrow('not an evidence line this codec wrote');
    // An index listing items over no evidence section is refused, never read as evidence-less.
    expect(() => readEvidenceItems(goal.replace(FIELD_EVIDENCE_HEADING, '## Evidence'))).toThrow(
      'the index lists "m1 m2" but the goal has no evidence section',
    );
    // Any stored text becomes an item's: one line, within the bound, a cut marked.
    expect(evidenceText('  two\n lines  ')).toBe('two lines');
    const long = evidenceText('f'.repeat(EVIDENCE_TEXT_MAX_LENGTH + 40));
    expect(long).toHaveLength(EVIDENCE_TEXT_MAX_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });

  it('[QL-71] names the unit of work the page is for in its index, kept through a split and a recompose, and says every unit item listed is that unit’s only when it names one', () => {
    const unitKey = 'company=acme';
    const named = composeFieldGoal({
      pipeline: 'field-answer',
      prose: PROSE,
      fields: fields(),
      evidence: [],
      kinds: [],
      unitKey,
    });
    expect(readFieldIndex(named)?.unitKey).toBe(unitKey);
    const split = splitFieldGoal(named);
    expect(split?.unitKey).toBe(unitKey);
    if (split === null) throw new Error('the composed goal must split');
    const recalled = composeFieldGoal({
      ...split,
      evidence: evidence(),
      kinds: DOCUMENT_MEMORY_LEGEND,
    });
    expect(splitFieldGoal(recalled)).toEqual(split);
    const sentence =
      'Every unit item listed was recorded for a unit of work its mission identifies as the one this goal names.';
    expect(unitNamedLegend(['unit'])).toBe(sentence);
    expect(recalled).toContain(`unit of work this goal names. ${sentence}\n`);
    // Nothing to say when no scope binds to a unit: the search then leaves nothing out.
    expect(unitNamedLegend([])).toBeNull();
    // Written nowhere but the index: every stage reads the sentence, none the key.
    expect(stripIndexSection(recalled)).not.toContain(unitKey);
    // A goal naming no unit has no key and no sentence, and reads as before one could be named.
    const unnamed = composeFieldGoal({
      ...split,
      unitKey: undefined,
      evidence: evidence(),
      kinds: DOCUMENT_MEMORY_LEGEND,
    });
    expect(readFieldIndex(unnamed)).not.toHaveProperty('unitKey');
    expect(splitFieldGoal(unnamed)).not.toHaveProperty('unitKey');
    expect(unnamed).not.toContain(sentence);
    expect(recalled.replace(` ${sentence}`, '').replace(`,"unitKey":"${unitKey}"`, '')).toBe(
      unnamed,
    );
    // Only a key the engine composes is read: an empty one is no index at all.
    expect(
      readFencedIndex(named.replace(unitKey, ''), fieldIndexSchemaFor('field-answer')),
    ).toBeNull();
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

  it('[BRW-27] holds the options of a control typed into open: it lists only what it offers for the words it holds', () => {
    const [, auth] = fields();
    if (auth === undefined) throw new Error('the form fixture lists no chosen field');
    const typed = { ...auth, inputType: 'search' };
    expect(closedOptionsOf(auth)).toEqual(auth.options);
    expect(closedOptionsOf(typed)).toBeNull();
    // Words past what it offers are the page's to take or refuse: no fault.
    expect(valueFaults(typed, 'Maybe')).toEqual([]);
  });

  it('[QL-39] finds its own fields heading even when the prose uses the same words', () => {
    const prose = `${PROSE}\n\n${FIELDS_HEADING}\n\nThe mission mentions this heading in passing.`;
    const split = splitFieldGoal(
      composeFieldGoal({
        pipeline: 'field-answer',
        prose,
        fields: fields(),
        evidence: [],
        kinds: [],
      }),
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
      composeFieldGoal({
        pipeline: 'field-answer',
        prose: PROSE,
        fields: many,
        evidence: [],
        kinds: [],
      }),
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
      kinds: [],
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

describe('fieldTypeOf', () => {
  it("[QL-38] names a field's control kind from its role, else its input type — what asks, for the prompt, the guidance record and the recall's budget", () => {
    expect(fieldTypeOf({ role: 'textbox', inputType: 'number' })).toBe('number');
    expect(fieldTypeOf({ role: 'textbox', inputType: 'text' })).toBe('text');
    expect(fieldTypeOf({ role: 'textbox', inputType: 'textarea' })).toBe('textarea');
    expect(fieldTypeOf({ role: 'textbox', inputType: null })).toBe('text');
    expect(fieldTypeOf({ role: 'combobox', inputType: 'select' })).toBe('select');
    expect(fieldTypeOf({ role: 'radiogroup', inputType: null })).toBe('radio');
    expect(fieldTypeOf({ role: 'checkbox', inputType: 'checkbox' })).toBe('checkbox');
    expect(fieldTypeOf({ role: 'button', inputType: null })).toBe('unknown');
  });
});
