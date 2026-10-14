import { describeInFlight, describeUnassessedBase } from '@sysdesign/contracts';
import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  makeEvaluation,
  makeRevision,
  makeRevisionSummary,
  makeSession,
} from '../../testing/fixtures';
import { PracticeWorkspace } from './practice-workspace';
import { SESSION, SESSION_PATH, sessionRoutes } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PracticeWorkspace grading a revision again', () => {
  const FAILED_REF = {
    runId: 'run-1',
    iteration: 1,
    status: 'failed',
    overall: null,
    decision: null,
  } as const;
  const RUNNING_REF = { ...FAILED_REF, runId: 'run-2', status: 'running' } as const;
  const EVALUATION_PATH = /^\/api\/revisions\/rev-1\/evaluation$/;
  const ungradedBody = { overall: null, decision: null, dimensions: {}, findings: [] };

  it('[UX-17] re-grades a failed revision in place: the same revision, a fresh run, and no second revision submitted', async () => {
    const { calls } = stubApi([
      {
        method: 'POST',
        path: EVALUATION_PATH,
        status: 202,
        body: { data: makeRevision({ evaluation: RUNNING_REF }) },
      },
      {
        path: EVALUATION_PATH,
        sequence: [
          {
            data: makeEvaluation({
              ...ungradedBody,
              status: 'failed',
              criterionResults: [],
              error: 'the model went away',
            }),
          },
          { data: makeEvaluation({ runId: 'run-2', overall: 81, decision: 'accept' }) },
        ],
      },
      ...sessionRoutes({ revisions: [makeRevisionSummary({ evaluation: FAILED_REF })] }),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Feedback' }));
    const failed = await screen.findByTestId('evaluation-error');
    expect(failed.textContent).toContain('the model went away');
    expect(screen.getByTestId('submission-status').textContent).toBe(
      'submitted #1 · grading failed',
    );

    await userEvent.click(screen.getByTestId('retry-evaluation'));

    // The new run's grade lands on the same revision.
    expect((await screen.findByTestId('overall-score')).textContent).toBe('81');
    expect(screen.queryByTestId('evaluation-error')).toBeNull();
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #1 · graded');
    const posts = calls.filter((call) => call.method === 'POST').map((call) => call.url);
    expect(posts).toEqual(['/api/revisions/rev-1/evaluation']);

    await userEvent.click(screen.getByRole('tab', { name: 'Revisions' }));
    expect(screen.getAllByTestId(/^revision-chip-/)).toHaveLength(1);
  });

  it('[UX-18] a grade the lenses could not settle reads as no verdict everywhere — the feedback, the badge, the chip — the coach refuses it, and it is graded again in place', async () => {
    const UNSCORED_REF = { ...FAILED_REF, status: 'complete', decision: 'escalate' } as const;
    const unassessed = makeEvaluation({
      overall: null,
      unscored: 'unassessed',
      decision: 'escalate',
      decisionReason: 'only 0% of criteria assessed; unassessed: c1, c2, c3',
      decisionBasis: {
        factor: 'evidence',
        facts: {},
        remediations: 0,
        criteria: { assessed: 0, total: 3 },
      },
      dimensions: { coverage: null, quality_attributes: null, compliance: null },
      degraded: [{ stage: 'evaluator.requirements', sample: 1, reason: 'llm-failed' }],
    });
    const { calls } = stubApi([
      {
        method: 'POST',
        path: EVALUATION_PATH,
        status: 202,
        body: { data: makeRevision({ evaluation: RUNNING_REF }) },
      },
      {
        path: EVALUATION_PATH,
        sequence: [
          { data: unassessed },
          { data: makeEvaluation({ runId: 'run-2', overall: 81, decision: 'accept' }) },
        ],
      },
      ...sessionRoutes({ revisions: [makeRevisionSummary({ evaluation: UNSCORED_REF })] }),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Feedback' }));
    const notice = await screen.findByTestId('evaluation-unscored');
    expect(notice.textContent).toContain('This revision couldn’t be graded');
    expect(screen.queryByTestId('overall-score')).toBeNull();
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #1 · not assessed');

    await userEvent.click(screen.getByRole('tab', { name: 'Revisions' }));
    const chip = screen.getByTestId('revision-chip-1');
    expect(within(chip).getByTestId('revision-unscored').textContent).toBe('not assessed');
    expect(within(chip).queryByTestId('revision-decision')).toBeNull();
    expect(within(chip).queryByTestId('revision-score')).toBeNull();

    // No grade for the coach to start from: off, with why, before the API would refuse it.
    await userEvent.click(screen.getByRole('tab', { name: 'Coach' }));
    const start = screen.getByTestId('improve-run') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(describeUnassessedBase(1));

    await userEvent.click(screen.getByRole('tab', { name: 'Feedback' }));
    await userEvent.click(within(notice).getByTestId('retry-evaluation'));
    expect((await screen.findByTestId('overall-score')).textContent).toBe('81');
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #1 · graded');
    const posts = calls.filter((call) => call.method === 'POST').map((call) => call.url);
    expect(posts).toEqual(['/api/revisions/rev-1/evaluation']);
  });

  it('[UX-17] says a refused re-grade in the server’s words, and leaves the failed grade on show', async () => {
    const refusal = 'Revision #1 already has a grade — there is nothing to grade again.';
    stubApi([
      {
        method: 'POST',
        path: EVALUATION_PATH,
        status: 409,
        body: { statusCode: 409, message: refusal },
      },
      {
        path: EVALUATION_PATH,
        body: {
          data: makeEvaluation({
            ...ungradedBody,
            status: 'failed',
            criterionResults: [],
            error: 'the model went away',
          }),
        },
      },
      ...sessionRoutes({ revisions: [makeRevisionSummary({ evaluation: FAILED_REF })] }),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Feedback' }));
    await userEvent.click(await screen.findByTestId('retry-evaluation'));

    const alert = await screen.findByTestId('submit-error');
    expect(within(alert).getByText("Couldn't grade this revision again")).toBeTruthy();
    expect(alert.textContent).toContain(refusal);
    expect(screen.getByTestId('evaluation-error')).toBeTruthy();
  });

  it('[UX-17] offers the same re-grade for a revision whose grade the grader no longer has', async () => {
    const { calls } = stubApi([
      {
        method: 'POST',
        path: EVALUATION_PATH,
        status: 202,
        body: { data: makeRevision({ evaluation: RUNNING_REF }) },
      },
      {
        path: EVALUATION_PATH,
        handler: ({ count }) =>
          count === 0
            ? {
                status: 404,
                body: {
                  statusCode: 404,
                  message: 'Revision rev-1 has no evaluation the grader can read',
                  missing: 'evaluation',
                },
              }
            : { body: { data: makeEvaluation({ runId: 'run-2', overall: 81 }) } },
      },
      // The record's last word on the run was "running": nobody could read it since.
      ...sessionRoutes({
        revisions: [makeRevisionSummary({ evaluation: { ...FAILED_REF, status: 'running' } })],
      }),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Feedback' }));
    const notice = await screen.findByTestId('evaluation-ungraded');
    expect(notice.getAttribute('data-reason')).toBe('lost');
    // The revision is there: this is not the page's not-found, and not a failure.
    expect(screen.queryByRole('heading', { name: 'Practice session not found' })).toBeNull();
    expect(screen.queryByTestId('evaluation-error')).toBeNull();
    // Nothing is grading it: the toolbar does not say "grading…", and Submit is not held.
    expect(screen.getByTestId('submission-status').getAttribute('data-status')).toBe('failed');
    expect((screen.getByTestId('submit-revision') as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(screen.getByTestId('retry-evaluation'));

    expect((await screen.findByTestId('overall-score')).textContent).toBe('81');
    expect(screen.queryByTestId('evaluation-ungraded')).toBeNull();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});

describe('PracticeWorkspace while a run holds the session', () => {
  it('[DEL-3] keeps Submit and the coach off — in the session’s own words — while a run holds the slot, whichever revision is on screen', async () => {
    const holding = {
      kind: 'grade',
      runId: 'run-2',
      revisionNumber: 2,
      state: 'running',
    } as const;
    const revisions = [
      makeRevisionSummary({
        id: 'rev-2',
        revisionNumber: 2,
        evaluation: {
          runId: 'run-2',
          iteration: 1,
          status: 'running',
          overall: null,
          decision: null,
        },
      }),
      makeRevisionSummary(),
    ];
    stubApi(
      sessionRoutes({
        revisions,
        extra: [
          {
            path: /^\/api\/revisions\/rev-2\/evaluation$/,
            body: { data: makeEvaluation({ status: 'running', overall: null, decision: null }) },
          },
        ],
      }).map((route) =>
        route.path === SESSION_PATH
          ? { path: SESSION_PATH, body: { data: makeSession({ id: SESSION, inFlight: holding }) } }
          : route,
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Revisions' }));
    await userEvent.click(screen.getByTestId('revision-chip-1'));
    expect(await screen.findByTestId('readonly-banner')).toBeTruthy();

    // The badge and the gate follow the session's newest submission, not revision #1 on screen.
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #2 · grading…');
    await userEvent.click(screen.getByRole('button', { name: 'Restore as draft' }));
    const submit = screen.getByTestId('submit-revision') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.title).toBe(describeInFlight(holding));

    await userEvent.click(screen.getByRole('tab', { name: 'Coach' }));
    expect((screen.getByTestId('improve-run') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('improver-unavailable').textContent).toBe(describeInFlight(holding));
  });
});
