import { fieldSpecOf, formObservation, type FieldSpec } from '@sysdesign/contracts';

import { askListed, listedOptionOf } from './operator-reply';
import type { OperatorPrompt } from './ports';
import { ScriptedOperator } from './testing';

/** A field of the form fixture, by ref. */
const fieldOf = (ref: string): FieldSpec => {
  const element = formObservation().elements.find((candidate) => candidate.ref === ref);
  if (element === undefined) throw new Error(`the form fixture has no ${ref}`);
  return fieldSpecOf(element);
};
const years = fieldOf('e1');
const authorisation = fieldOf('e2');

const promptFor = (field: FieldSpec): OperatorPrompt => ({
  field,
  suggestion: null,
  why: 'no evidence',
  task: null,
  page: 'Apply',
});

describe('an operator reply to a field with listed options', () => {
  it('[BRW-3] names an option in the page’s spelling: the option itself, else the one equal to it but for case', () => {
    expect(listedOptionOf(['Yes', 'No'], 'Yes')).toBe('Yes');
    expect(listedOptionOf(['Yes', 'No'], ' yes ')).toBe('Yes');
    expect(listedOptionOf(['Yes', 'No'], 'NO')).toBe('No');
    expect(listedOptionOf(['Yes', 'No'], 'maybe')).toBeNull();
    // An exact option wins; two options equal but for case are named by neither fold.
    expect(listedOptionOf(['Yes', 'YES'], 'YES')).toBe('YES');
    expect(listedOptionOf(['Yes', 'YES'], 'yes')).toBeNull();
  });

  it('[BRW-3] holds the answer to the closed list, asking again with the options when it names none', async () => {
    const operator = new ScriptedOperator([
      { kind: 'answer', text: 'maybe' },
      { kind: 'answer', text: 'yes' },
    ]);
    expect(await askListed(operator, promptFor(authorisation))).toEqual({
      kind: 'answer',
      text: 'Yes',
    });
    expect(operator.prompts).toHaveLength(2);
    expect(operator.notices).toEqual(['"maybe" is not one of this field\'s options: Yes | No']);
  });

  it('[BRW-3] passes every other reply through: no options, an open list, a blank, a read-back, a stop', async () => {
    const typed = new ScriptedOperator([{ kind: 'answer', text: 'six' }]);
    expect(await askListed(typed, promptFor(years))).toEqual({ kind: 'answer', text: 'six' });
    const open = { ...authorisation, optionsOmitted: 3 };
    const beyond = new ScriptedOperator([{ kind: 'answer', text: 'Pending' }]);
    expect(await askListed(beyond, promptFor(open))).toEqual({ kind: 'answer', text: 'Pending' });
    for (const reply of [{ kind: 'blank' }, { kind: 'read-back' }, { kind: 'stop' }] as const) {
      const operator = new ScriptedOperator([reply]);
      expect(await askListed(operator, promptFor(authorisation))).toEqual(reply);
      expect(operator.notices).toEqual([]);
    }
  });
});
