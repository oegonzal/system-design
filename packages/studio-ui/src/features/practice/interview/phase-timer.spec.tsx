import { PRACTICE_FORMATS } from '@sysdesign/contracts';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatClock, PhaseTimer } from './phase-timer';

const [clarify] = PRACTICE_FORMATS.interview.phases;
const STARTED = '2026-10-20T10:00:00.000Z';
const at = (seconds: number) => () => new Date(STARTED).getTime() + seconds * 1000;

describe('PhaseTimer', () => {
  it('[UX-27] counts the phase down from the server’s start against the format’s minutes, and says how far over it has run — never ending it', () => {
    if (!clarify) throw new Error('the interview format declares phases');
    const { unmount } = renderWithTheme(
      <PhaseTimer phase={clarify} startedAt={STARTED} now={at(125)} />,
    );
    expect(screen.getByTestId('phase-timer').textContent).toBe(
      `${clarify.label} ${formatClock(clarify.minutes * 60 - 125)} left`,
    );
    unmount();
    renderWithTheme(
      <PhaseTimer phase={clarify} startedAt={STARTED} now={at(clarify.minutes * 60 + 61)} />,
    );
    expect(screen.getByTestId('phase-timer').textContent).toBe(`${clarify.label} over by 01:01`);
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(3599)).toBe('59:59');
  });
});
