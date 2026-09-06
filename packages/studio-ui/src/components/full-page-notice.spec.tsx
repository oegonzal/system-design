import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FullPageNotice } from './full-page-notice';

describe('FullPageNotice', () => {
  it('renders the title and message', () => {
    renderWithTheme(
      <FullPageNotice title="Session not found" message="It may have been removed." />,
    );
    expect(screen.getByRole('heading', { name: 'Session not found' })).toBeTruthy();
    expect(screen.getByText('It may have been removed.')).toBeTruthy();
  });

  it('renders a Back link to the given href when backHref is set', () => {
    renderWithTheme(<FullPageNotice title="Gone" message="—" backHref="/" />);
    const back = screen.getByTestId('notice-back');
    expect(back.getAttribute('href')).toBe('/');
    expect(screen.queryByTestId('notice-retry')).toBeNull();
  });

  it('renders a Retry button that fires onRetry, and none without it', () => {
    const onRetry = vi.fn();
    const { rerender } = renderWithTheme(
      <FullPageNotice title="Failed" message="—" onRetry={onRetry} />,
    );
    expect(screen.getByTestId('notice-retry')).toBeTruthy();

    rerender(<FullPageNotice title="Gone" message="—" />);
    expect(screen.queryByTestId('notice-retry')).toBeNull();
  });

  it('calls onRetry when Retry is clicked', async () => {
    const onRetry = vi.fn();
    renderWithTheme(<FullPageNotice title="Failed" message="—" onRetry={onRetry} />);
    await userEvent.click(screen.getByTestId('notice-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
