import { describe, expect, it } from 'vitest';

import { QUALITY_RUN_STATUSES } from '@sysdesign/contracts';

import { makeEvaluation } from '../../testing/fixtures';
import {
  cachedStandingOf,
  formatScore,
  GRADE_STANDING_LABEL,
  NO_SCORE,
  standingOf,
  type GradeStanding,
} from './score';

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

describe('GRADE_STANDING_LABEL', () => {
  it('words every standing a grade can have, and prints none as its wire token', () => {
    const standings: GradeStanding[] = [...QUALITY_RUN_STATUSES, 'unscored'];
    for (const standing of standings) {
      expect(GRADE_STANDING_LABEL[standing]).toBeTruthy();
      expect(GRADE_STANDING_LABEL[standing]).not.toBe(standing);
    }
  });
});

describe('a grade’s standing', () => {
  it('[UX-18] reads a complete grade that earned no score as unscored — never "graded" — and a real 0 as graded', () => {
    expect(standingOf(makeEvaluation({ unscored: 'unassessed', overall: null }))).toBe('unscored');
    expect(standingOf(makeEvaluation({ unscored: 'no-artifact', overall: null }))).toBe('unscored');
    expect(standingOf(makeEvaluation({ overall: 0 }))).toBe('complete');
    expect(standingOf(makeEvaluation({ status: 'failed' }))).toBe('failed');
  });

  it('[UX-18] reads the same from a revision’s cached grade, whose missing score on a complete grade is the unscored mark', () => {
    const ref = { runId: 'run-1', iteration: 1, decision: 'escalate' } as const;
    expect(cachedStandingOf({ ...ref, status: 'complete', overall: null })).toBe('unscored');
    expect(cachedStandingOf({ ...ref, status: 'complete', overall: 0 })).toBe('complete');
    expect(cachedStandingOf({ ...ref, status: 'running', overall: null })).toBe('running');
    expect(cachedStandingOf({ ...ref, status: 'failed', overall: null })).toBe('failed');
  });
});
