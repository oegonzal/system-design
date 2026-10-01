import { describe, expect, it } from 'vitest';

import { QUALITY_RUN_STATUSES } from '@sysdesign/contracts';

import { formatScore, GRADE_STATUS_LABEL, NO_SCORE } from './score';

describe('formatScore', () => {
  it('[EVAL-1] prints whole points, the precision the dimension meters show', () => {
    expect(formatScore(12.1)).toBe('12');
    expect(formatScore(16.5)).toBe('17');
    expect(formatScore(64)).toBe('64');
    expect(formatScore(0)).toBe('0');
  });

  it('prints the placeholder for a score that does not exist', () => {
    expect(formatScore(null)).toBe(NO_SCORE);
    expect(formatScore(undefined)).toBe(NO_SCORE);
  });
});

describe('GRADE_STATUS_LABEL', () => {
  it('words every status a grading run can have, and prints none as its wire token', () => {
    for (const status of QUALITY_RUN_STATUSES) {
      expect(GRADE_STATUS_LABEL[status]).toBeTruthy();
      expect(GRADE_STATUS_LABEL[status]).not.toBe(status);
    }
  });
});
