import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubmissionStatus } from './submission-status';

describe('SubmissionStatus', () => {
  it('[DEL-3] names the author’s latest submission as that — never a label for what the canvas shows — with its grade in the studio’s words', () => {
    const graded = renderWithTheme(<SubmissionStatus revisionNumber={1} status="complete" />);
    const badge = screen.getByTestId('submission-status');
    expect(badge.textContent).toBe('submitted #1 · graded');
    expect(badge.getAttribute('title')).toBe('Your latest submission, revision #1: graded');
    expect(badge.getAttribute('data-revision')).toBe('1');
    expect(badge.getAttribute('data-status')).toBe('complete');
    graded.unmount();

    const running = renderWithTheme(<SubmissionStatus revisionNumber={2} status="running" />);
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #2 · grading…');
    running.unmount();

    const failed = renderWithTheme(<SubmissionStatus revisionNumber={3} status="failed" />);
    expect(screen.getByTestId('submission-status').textContent).toBe(
      'submitted #3 · grading failed',
    );
    failed.unmount();
  });

  it('shows nothing before anything was submitted', () => {
    renderWithTheme(<SubmissionStatus revisionNumber={null} status={null} />);
    expect(screen.queryByTestId('submission-status')).toBeNull();
  });
});
