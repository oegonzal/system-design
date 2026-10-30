import { fieldSpecOf, observedElement } from '@sysdesign/contracts';

import { fillActionOf } from './field-fill';

/** How a field's answer reaches the page: chosen where the field is chosen from, typed where it is only typed into. */
describe('the action a field answer takes', () => {
  it('[BRW-27] chooses on a field chosen from — a control typed into included — and types only where nothing is chosen', () => {
    const kindOf = (element: ReturnType<typeof observedElement>): string =>
      fillActionOf(fieldSpecOf(element), 'United States of America').kind;
    // An input with the combobox role is typed into and committed by a choice: the answer is a select.
    expect(
      kindOf(
        observedElement('e1', 'combobox', 'Country *', {
          kind: 'fillable',
          inputType: 'search',
          options: ['United States of America'],
        }),
      ),
    ).toBe('select');
    // A combobox on no typed control, and a native select, are chosen from as before.
    expect(kindOf(observedElement('e2', 'combobox', 'Country', { kind: 'selectable' }))).toBe(
      'select',
    );
    expect(
      kindOf(
        observedElement('e3', 'combobox', 'Country', { kind: 'selectable', inputType: 'select' }),
      ),
    ).toBe('select');
    // A textbox is typed into.
    expect(
      kindOf(observedElement('e4', 'textbox', 'City', { kind: 'fillable', inputType: 'text' })),
    ).toBe('fill');
  });
});
