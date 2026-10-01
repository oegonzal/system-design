import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeExperience, makeSession } from '../../testing/fixtures';
import { Dashboard, RECENT_SESSIONS_PAGE } from './dashboard.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  resetNavigationMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const EXPERIENCES = {
  path: '/api/experiences',
  body: { data: [makeExperience()], meta: { total: 1, limit: 50, offset: 0 } },
};

/** `total` sessions on the server, served a page at a time as the client asks. */
const sessionsRoute = (total: number) => ({
  path: '/api/sessions',
  handler: ({ url }: { url: URL }) => {
    const limit = Number(url.searchParams.get('limit'));
    const offset = Number(url.searchParams.get('offset'));
    const page = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      makeSession({ id: `session-${offset + i}`, promptTitle: `Prompt ${offset + i}` }),
    );
    return { body: { data: page, meta: { total, limit, offset } } };
  },
});

describe('Dashboard', () => {
  it('[UX-12] loads each section on its own: a failed session list says so with a Retry, and the experiences stay up', async () => {
    const user = userEvent.setup();
    let sessionsDown = true;
    const sessions = sessionsRoute(1);
    stubApi([
      EXPERIENCES,
      {
        path: '/api/sessions',
        handler: (call) => {
          if (sessionsDown) throw new TypeError('Failed to fetch');
          return sessions.handler(call);
        },
      },
    ]);

    renderWithTheme(<Dashboard />);

    expect(await screen.findByTestId('experience-list')).toBeTruthy();
    const failure = await screen.findByTestId('sessions-error');
    expect(failure.textContent).toContain("Couldn't load your sessions");
    // The browser's own words never reach the page.
    expect(failure.textContent).not.toContain('Failed to fetch');
    expect(screen.queryByTestId('experiences-error')).toBeNull();

    sessionsDown = false;
    await user.click(within(failure).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('session-list')).toBeTruthy();
    expect(screen.queryByTestId('sessions-error')).toBeNull();
  });

  it('[UX-12] keeps Surprise me off while the experiences cannot load, and offers their Retry', async () => {
    stubApi([
      { path: '/api/experiences', status: 503, body: { statusCode: 503, message: 'Down' } },
      sessionsRoute(0),
    ]);

    renderWithTheme(<Dashboard />);

    const failure = await screen.findByTestId('experiences-error');
    expect(failure.textContent).toContain('Down');
    expect(within(failure).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect((screen.getByTestId('surprise-me') as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/No practice sessions yet/)).toBeTruthy();
  });

  it('names each session by its prompt with a readable status, and pages through the rest', async () => {
    const user = userEvent.setup();
    const total = RECENT_SESSIONS_PAGE + 3;
    stubApi([EXPERIENCES, sessionsRoute(total)]);

    renderWithTheme(<Dashboard />);

    await waitFor(() =>
      expect(screen.getAllByTestId('session-card')).toHaveLength(RECENT_SESSIONS_PAGE),
    );
    const first = screen.getAllByTestId('session-card')[0];
    expect(within(first).getByRole('heading', { level: 3, name: 'Prompt 0' })).toBeTruthy();
    expect(within(first).getByTestId('session-status').textContent).toBe('In progress');
    expect(within(first).getByTestId('session-decision').textContent).toBe('Revise');

    const more = screen.getByTestId('more-sessions');
    expect(more.textContent).toBe(`Show more sessions (${RECENT_SESSIONS_PAGE} of ${total})`);
    await user.click(more);
    await waitFor(() => expect(screen.getAllByTestId('session-card')).toHaveLength(total));
    expect(screen.queryByTestId('more-sessions')).toBeNull();
  });
});
