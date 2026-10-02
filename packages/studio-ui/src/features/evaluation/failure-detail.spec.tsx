import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FailureDetail } from './failure-detail';

describe('FailureDetail', () => {
  it('keeps a run’s own error folded under a control anyone can open, and wraps it inside the dock', async () => {
    renderWithTheme(<FailureDetail detail="connect ECONNREFUSED 127.0.0.1:3003" />);

    const fold = screen.getByTestId('failure-detail') as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    const line = screen.getByText('connect ECONNREFUSED 127.0.0.1:3003');
    expect(getComputedStyle(line).overflowWrap).toBe('anywhere');

    // A native disclosure: its summary is the control, by pointer or keyboard.
    await userEvent.click(screen.getByText('Technical details'));
    expect(fold.open).toBe(true);
  });
});
