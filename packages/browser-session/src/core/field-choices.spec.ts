import { OPTIONS_BOUND, type FieldSpec } from '@sysdesign/contracts';

import { withTypedChoices } from './field-choices';

const field = (ref: string, overrides: Partial<FieldSpec>): FieldSpec => ({
  ref,
  role: 'textbox',
  name: `Field ${ref}`,
  inputType: 'text',
  options: null,
  optionsOmitted: 0,
  value: null,
  required: true,
  invalid: false,
  maxLength: null,
  hiddenTraits: [],
  context: null,
  ...overrides,
});

/** A browser whose typed controls offer what the table says, recording which it opened. */
const browserOffering = (offers: Record<string, readonly string[]>) => {
  const opened: string[] = [];
  return {
    opened,
    readChoices: async (ref: string) => {
      opened.push(ref);
      return offers[ref] ?? null;
    },
  };
};

describe('the options a typed control offers', () => {
  it('[BRW-27] are read for a control typed into and chosen from that lists none, one control at a time, and become its options; every other field is left as it is', async () => {
    const browser = browserOffering({ e1: ['United States +1', 'United Kingdom +44'] });
    const typed = field('e1', { role: 'combobox' });
    const silent = field('e2', { role: 'combobox' });
    const listed = field('e3', { role: 'combobox', inputType: null, options: ['Yes', 'No'] });
    const text = field('e4', {});
    const read = await withTypedChoices(browser, [typed, silent, listed, text]);
    expect(read.map((f) => f.options)).toEqual([
      ['United States +1', 'United Kingdom +44'],
      null,
      ['Yes', 'No'],
      null,
    ]);
    // Only the controls typed into and chosen from that listed nothing were opened, in order.
    expect(browser.opened).toEqual(['e1', 'e2']);
  });

  it('[BRW-27] keeps the options bound and counts the options past it', async () => {
    const many = Array.from({ length: OPTIONS_BOUND.target + 4 }, (_, i) => `Option ${i}`);
    const [read] = await withTypedChoices(browserOffering({ e1: many }), [
      field('e1', { role: 'combobox' }),
    ]);
    expect(read?.options).toHaveLength(OPTIONS_BOUND.target);
    expect(read?.optionsOmitted).toBe(4);
  });
});
