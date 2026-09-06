import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { PracticeWorkspace } from './practice-workspace';

const SESSION = '00000000-0000-4000-8000-000000000000';
const SESSION_PATH = new RegExp(`^/api/sessions/${SESSION}$`);
const AVAILABILITY = {
  method: 'GET',
  path: '/api/improvement-runs/availability',
  body: { data: { enabled: false, model: null, reason: 'no-key' } },
};

afterEach(() => {
  // stub-api installs a global fetch; a leaked mock would break the next spec.
});

describe('PracticeWorkspace load failures', () => {
  it('shows a graceful not-found with a way back — never the raw server message — on a 404', async () => {
    stubApi([
      {
        path: SESSION_PATH,
        status: 404,
        body: { statusCode: 404, message: `Session ${SESSION} not found` },
      },
      AVAILABILITY,
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    expect(await screen.findByRole('heading', { name: 'Session not found' })).toBeTruthy();
    expect(screen.getByTestId('notice-back').getAttribute('href')).toBe('/');
    // The raw Nest message is never surfaced as the screen.
    expect(screen.queryByText(`Session ${SESSION} not found`)).toBeNull();
    // A 404 will not change on retry, so no Retry button.
    expect(screen.queryByTestId('notice-retry')).toBeNull();
  });

  it('shows a retryable error on a transient failure, and Retry re-issues the request', async () => {
    const { calls } = stubApi([
      {
        path: SESSION_PATH,
        // 500 first, 500 again after Retry — assert the load re-runs.
        sequence: [
          { statusCode: 500, message: 'boom' },
          { statusCode: 500, message: 'boom' },
        ],
        status: 500,
      },
      AVAILABILITY,
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    expect(await screen.findByRole('heading', { name: "Couldn't load this session" })).toBeTruthy();
    const sessionCalls = () => calls.filter((c) => SESSION_PATH.test(c.url)).length;
    expect(sessionCalls()).toBe(1);

    await userEvent.click(screen.getByTestId('notice-retry'));

    await waitFor(() => expect(sessionCalls()).toBe(2));
    // Still failing, so the retryable error persists.
    expect(screen.getByRole('heading', { name: "Couldn't load this session" })).toBeTruthy();
  });
});
