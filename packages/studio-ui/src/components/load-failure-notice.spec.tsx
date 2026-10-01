import { ApiError } from '@sysdesign/web-kit';
import { renderWithTheme } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoadFailureNotice } from './load-failure-notice';

const EXIT = { href: '/prompts', label: 'Back to your prompts' };

describe('LoadFailureNotice', () => {
  it('[UX-12] calls a 404 or a malformed id not found, with only the way out — reading again changes nothing', () => {
    for (const error of [
      new ApiError(404, { statusCode: 404, message: 'prompt p-1 not found' }),
      new ApiError(400, { statusCode: 400, message: 'Validation failed (uuid is expected)' }),
    ]) {
      const { unmount } = renderWithTheme(
        <LoadFailureNotice noun="prompt" error={error} onRetry={vi.fn()} exit={EXIT} />,
      );
      expect(screen.getByRole('heading', { level: 1, name: 'Prompt not found' })).toBeTruthy();
      // The server's words — an id, a pipe's complaint — never reach the reader.
      expect(screen.getByTestId('full-page-notice').textContent).not.toMatch(/p-1|uuid/);
      expect(screen.queryByTestId('notice-retry')).toBeNull();
      expect(screen.getByTestId('notice-back').getAttribute('href')).toBe('/prompts');
      unmount();
    }
  });

  it('[UX-12] says a failed load could not load, in readable words, and retries on request', async () => {
    const onRetry = vi.fn();
    renderWithTheme(
      <LoadFailureNotice
        noun="STAR story"
        error={new TypeError('Failed to fetch')}
        onRetry={onRetry}
        exit={EXIT}
      />,
    );
    expect(screen.getByRole('heading', { name: "Couldn't load this STAR story" })).toBeTruthy();
    expect(screen.getByTestId('full-page-notice').textContent).not.toContain('Failed to fetch');
    await userEvent.click(screen.getByTestId('notice-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('[UX-12] keeps the server’s own words for a failure it answered', () => {
    renderWithTheme(
      <LoadFailureNotice
        noun="prompt"
        error={new ApiError(503, { statusCode: 503, message: 'The studio is restarting' })}
        onRetry={vi.fn()}
        exit={EXIT}
      />,
    );
    expect(screen.getByText('The studio is restarting')).toBeTruthy();
    expect(screen.getByTestId('notice-retry')).toBeTruthy();
  });
});
