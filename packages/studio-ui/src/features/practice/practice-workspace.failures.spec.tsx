import { describeInFlight } from '@sysdesign/contracts';
import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeEvaluation, makeRevisionSummary } from '../../testing/fixtures';
import { PracticeWorkspace } from './practice-workspace';
import { SESSION, SESSION_PATH, AVAILABILITY, sessionRoutes } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PracticeWorkspace load failures', () => {
  it('[UX-12] shows a graceful not-found with a way back — never the raw server message — on a 404', async () => {
    stubApi([
      {
        path: SESSION_PATH,
        status: 404,
        body: { statusCode: 404, message: `Session ${SESSION} not found` },
      },
      AVAILABILITY,
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    expect(await screen.findByRole('heading', { name: 'Practice session not found' })).toBeTruthy();
    expect(screen.getByTestId('notice-back').getAttribute('href')).toBe('/');
    expect(screen.queryByText(`Session ${SESSION} not found`)).toBeNull();
    expect(screen.queryByTestId('notice-retry')).toBeNull();
  });

  it('[UX-12] reads an id that cannot name a session as not found — no raw validation message, no Retry that cannot succeed', async () => {
    stubApi([
      {
        path: /^\/api\/sessions\/not-a-uuid$/,
        status: 400,
        body: { statusCode: 400, message: 'Validation failed (uuid is expected)' },
      },
      AVAILABILITY,
    ]);

    renderWithTheme(<PracticeWorkspace sessionId="not-a-uuid" />);

    expect(await screen.findByRole('heading', { name: 'Practice session not found' })).toBeTruthy();
    expect(screen.queryByText(/uuid is expected/)).toBeNull();
    expect(screen.queryByTestId('notice-retry')).toBeNull();
  });

  it('[UX-12] shows a retryable error on a transient failure, and Retry re-issues the request', async () => {
    const { calls } = stubApi([
      {
        path: SESSION_PATH,
        sequence: [
          { statusCode: 500, message: 'boom' },
          { statusCode: 500, message: 'boom' },
        ],
        status: 500,
      },
      AVAILABILITY,
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    expect(
      await screen.findByRole('heading', { name: "Couldn't load this practice session" }),
    ).toBeTruthy();
    const sessionCalls = () => calls.filter((c) => SESSION_PATH.test(c.url)).length;
    expect(sessionCalls()).toBe(1);

    await userEvent.click(screen.getByTestId('notice-retry'));

    await waitFor(() => expect(sessionCalls()).toBe(2));
    expect(
      screen.getByRole('heading', { name: "Couldn't load this practice session" }),
    ).toBeTruthy();
  });
});

describe('PracticeWorkspace when its session vanishes', () => {
  const GONE = {
    status: 404,
    body: { statusCode: 404, message: `Session ${SESSION} not found`, missing: 'session' },
  };

  it('[UX-12] turns into the one not-found when the revision being graded is gone — no "grading…" beside a failure, no retry that cannot succeed', async () => {
    const running = {
      runId: 'run-1',
      iteration: 1,
      status: 'running',
      overall: null,
      decision: null,
    } as const;
    stubApi([
      {
        path: /^\/api\/revisions\/rev-1\/evaluation$/,
        handler: ({ count }) =>
          count === 0
            ? {
                body: {
                  data: makeEvaluation({ status: 'running', overall: null, decision: null }),
                },
              }
            : {
                status: 404,
                body: { statusCode: 404, message: 'Revision rev-1 not found', missing: 'revision' },
              },
      },
      ...sessionRoutes({ revisions: [makeRevisionSummary({ evaluation: running })] }),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    expect((await screen.findByTestId('submission-status')).textContent).toBe(
      'submitted #1 · grading…',
    );

    expect(
      await screen.findByRole('heading', { name: 'Practice session not found' }, { timeout: 4000 }),
    ).toBeTruthy();
    expect(screen.queryByTestId('submission-status')).toBeNull();
    expect(screen.queryByTestId('evaluation-error')).toBeNull();
    expect(screen.queryByTestId('retry-evaluation')).toBeNull();
    expect(screen.queryByText(/Revision rev-1 not found/)).toBeNull();
    expect(screen.getByTestId('notice-back').getAttribute('href')).toBe('/');
  });

  it('[UX-12] turns into the same not-found when a draft save is the first to find the session gone — no "draft not saved", no alert', async () => {
    stubApi([
      { method: 'PUT', path: `/api/sessions/${SESSION}/draft`, ...GONE },
      ...sessionRoutes({}).filter((route) => route.method !== 'PUT'),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByTestId('palette-cache'));
    expect(screen.getByTestId('draft-status').textContent).toBe('unsaved draft');

    expect(
      await screen.findByRole('heading', { name: 'Practice session not found' }, { timeout: 4000 }),
    ).toBeTruthy();
    expect(screen.queryByTestId('draft-status')).toBeNull();
    expect(screen.queryByTestId('submit-error')).toBeNull();
    expect(screen.queryByText(`Session ${SESSION} not found`)).toBeNull();
    expect(screen.getByTestId('notice-back').getAttribute('href')).toBe('/');
  });

  it('[UX-12] turns into the same not-found when an action is the first to find the session gone', async () => {
    stubApi([
      { method: 'POST', path: `/api/sessions/${SESSION}/revisions`, ...GONE },
      ...sessionRoutes({}),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    const submit = await screen.findByTestId('submit-revision');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    expect(await screen.findByRole('heading', { name: 'Practice session not found' })).toBeTruthy();
    expect(screen.queryByTestId('submit-error')).toBeNull();
    expect(screen.queryByText(`Session ${SESSION} not found`)).toBeNull();
    // The tab, named after the prompt while the session was up, names the dead end now.
    expect(document.title).toBe('Practice session not found · System Design Studio');
  });
});

describe('PracticeWorkspace when an action fails', () => {
  it('[DEL-3] says a refused submit as an alert, in the server’s words', async () => {
    const reason = describeInFlight({
      kind: 'coach',
      runId: 'run-5',
      revisionNumber: 1,
      state: 'running',
    });
    stubApi(
      sessionRoutes({
        extra: [
          {
            method: 'POST',
            path: `/api/sessions/${SESSION}/revisions`,
            status: 409,
            body: { statusCode: 409, message: reason },
          },
        ],
      }),
    );

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    const submit = await screen.findByTestId('submit-revision');
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(submit);

    const alert = await screen.findByTestId('submit-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(within(alert).getByText("Couldn't submit for grading")).toBeTruthy();
    expect(alert.textContent).toContain(reason);
  });
});
