import { expect, it } from 'vitest';

import { numeral } from './format';

it('counts with two digits', () => {
  expect([1, 4, 10].map(numeral)).toEqual(['01', '04', '10']);
});
