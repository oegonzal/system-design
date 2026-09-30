import { renderWithTheme, stubApi, type StubRoute } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  makeEvaluation,
  makeImproveIteration,
  makeImproveRun,
  makePrompt,
  makeRevision,
  makeRevisionSummary,
  makeSession,
} from '../../testing/fixtures';
import { PracticeWorkspace } from './practice-workspace';

const SESSION = '00000000-0000-4000-8000-000000000000';
const SESSION_PATH = new RegExp(`^/api/sessions/${SESSION}$`);
const AVAILABILITY = {
  method: 'GET',
  path: '/api/grading/availability',
  body: { data: { model: 'test-model' } },
};

/** A session with one graded revision, and whatever the case adds. */
function sessionRoutes(overrides: {
  revisions?: ReturnType<typeof makeRevisionSummary>[];
  coachingRuns?: {
    runId: string;
    baseRevisionId: string;
    maxIterations: number;
    startedAt: string;
  }[];
  extra?: StubRoute[];
}): StubRoute[] {
  const revisions = overrides.revisions ?? [makeRevisionSummary()];
  return [
    { path: SESSION_PATH, body: { data: makeSession({ id: SESSION }) } },
    { path: '/api/prompts/prompt-1', body: { data: makePrompt() } },
    {
      path: `/api/sessions/${SESSION}/revisions`,
      body: { data: revisions, meta: { total: revisions.length, limit: 50, offset: 0 } },
    },
    { path: `/api/sessions/${SESSION}/improve`, body: { data: overrides.coachingRuns ?? [] } },
    { path: /^\/api\/revisions\/[^/]+$/, body: { data: makeRevision() } },
    { path: /^\/api\/revisions\/[^/]+\/evaluation$/, body: { data: makeEvaluation() } },
    AVAILABILITY,
    ...(overrides.extra ?? []),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PracticeWorkspace on open', () => {
  it('[UX-11] seeds the coach panel from the session’s newest coaching run on open', async () => {
    const { calls } = stubApi(
      sessionRoutes({
        coachingRuns: [
          {
            runId: 'run-9',
            baseRevisionId: 'rev-1',
            maxIterations: 3,
            startedAt: '2026-08-20T12:05:00.000Z',
          },
          {
            runId: 'run-2',
            baseRevisionId: 'rev-1',
            maxIterations: 3,
            startedAt: '2026-08-20T12:00:00.000Z',
          },
        ],
        extra: [
          {
            path: `/api/sessions/${SESSION}/improve/run-9`,
            body: {
              data: makeImproveRun({
                runId: 'run-9',
                status: 'complete',
                stopReason: 'max-iterations',
                iterations: [
                  makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 72 }),
                  makeImproveIteration({ iteration: 2, overall: 80, revisionId: 'rev-2' }),
                ],
              }),
            },
          },
        ],
      }),
    );

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Coach' }));
    expect((await screen.findByTestId('improve-iteration-2')).textContent).toContain('imported');
    expect(screen.getByTestId('improve-iteration-1').textContent).toContain('starting point');
    expect(calls.some((call) => call.url === `/api/sessions/${SESSION}/improve/run-9`)).toBe(true);
    expect(calls.some((call) => call.url === `/api/sessions/${SESSION}/improve/run-2`)).toBe(false);
  });

  it('[UX-11] hands an unedited, graded revision to the coach by id — no new revision is submitted', async () => {
    const { calls, fetchMock } = stubApi(
      sessionRoutes({
        extra: [
          {
            method: 'POST',
            path: `/api/sessions/${SESSION}/improve`,
            status: 202,
            body: { data: { runId: 'run-3', revision: makeRevision() } },
          },
          {
            path: `/api/sessions/${SESSION}/improve/run-3`,
            body: {
              data: makeImproveRun({
                runId: 'run-3',
                iterations: [makeImproveIteration({ iteration: 1, mode: 'adopted', overall: 72 })],
              }),
            },
          },
        ],
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Coach' }));
    await waitFor(() =>
      expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(false),
    );
    await userEvent.click(screen.getByTestId('improve-run'));

    expect(confirm).toHaveBeenCalledWith(
      'Hand revision #1 to the coach? Its grade is reused as the starting point.',
    );
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/improve'))).toBe(
        true,
      ),
    );
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      baseRevisionId: 'rev-1',
      maxIterations: 3,
    });
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
    expect((await screen.findByTestId('improve-iteration-1')).textContent).toContain(
      'grade reused',
    );
  });
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
    expect(screen.queryByText(`Session ${SESSION} not found`)).toBeNull();
    expect(screen.queryByTestId('notice-retry')).toBeNull();
  });

  it('shows a retryable error on a transient failure, and Retry re-issues the request', async () => {
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

    expect(await screen.findByRole('heading', { name: "Couldn't load this session" })).toBeTruthy();
    const sessionCalls = () => calls.filter((c) => SESSION_PATH.test(c.url)).length;
    expect(sessionCalls()).toBe(1);

    await userEvent.click(screen.getByTestId('notice-retry'));

    await waitFor(() => expect(sessionCalls()).toBe(2));
    expect(screen.getByRole('heading', { name: "Couldn't load this session" })).toBeTruthy();
  });
});
