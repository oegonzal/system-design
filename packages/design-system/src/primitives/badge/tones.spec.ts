import { CRITERION_RESULTS, DECISIONS } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { DECISION_TONE, RESULT_TONE } from './tones';

describe('badge tone maps', () => {
  it('gives every decision a tone, and only accept reads as success', () => {
    for (const decision of DECISIONS) expect(DECISION_TONE[decision]).toBeTruthy();
    expect(DECISION_TONE.accept).toBe('success');
    expect(DECISION_TONE.reject).toBe('critical');
  });

  it('gives every criterion result — and the unassessed one — a tone', () => {
    for (const result of CRITERION_RESULTS) expect(RESULT_TONE[result]).toBeTruthy();
    expect(RESULT_TONE.unassessed).toBe('neutral');
    expect(RESULT_TONE.pass).toBe('success');
  });
});
