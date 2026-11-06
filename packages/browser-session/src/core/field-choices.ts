import { choosesByTyping, OPTIONS_BOUND, type FieldSpec } from '@sysdesign/contracts';

import type { BrowserPort } from './ports';

/**
 * The fields asked, each control typed into and chosen from that lists no
 * options given the options its list offers when opened — read one control
 * at a time, so one list is open at once — within the options bound, the
 * rest counted. The answer is then one of the words the control offers,
 * never a value shaped by another site's options. Measured 2026-11-06: two
 * forms' country controls listed no options until opened, the answer on
 * record read "United States (+1)" — another site's option — and each
 * offered nothing for it, though "United States +1" and "🇺🇸 (+1) United
 * States of America" were in their lists.
 */
export async function withTypedChoices(
  browser: Pick<BrowserPort, 'readChoices'>,
  fields: readonly FieldSpec[],
): Promise<FieldSpec[]> {
  const read: FieldSpec[] = [];
  for (const field of fields) {
    const unlisted = field.options === null && choosesByTyping(field.role, field);
    const choices = unlisted ? await browser.readChoices(field.ref) : null;
    read.push(
      choices === null || choices.length === 0
        ? field
        : {
            ...field,
            options: choices.slice(0, OPTIONS_BOUND.target),
            optionsOmitted: Math.max(0, choices.length - OPTIONS_BOUND.target),
          },
    );
  }
  return read;
}
