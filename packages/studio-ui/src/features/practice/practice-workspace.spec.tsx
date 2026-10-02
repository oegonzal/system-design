import { describeInFlight, describeUnassessedBase } from '@sysdesign/contracts';
import { renderWithTheme, stubApi, type StubRoute } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  makeEvaluation,
  makeHeartbeat,
  makeImproveIteration,
  makeImproveRun,
  makePrompt,
  makeRevision,
  makeRevisionSummary,
  makeSession,
} from '../../testing/fixtures';
import { LOAD_REVISION_CONFIRM, PracticeWorkspace } from './practice-workspace';

const SESSION = '00000000-0000-4000-8000-000000000000';
const SESSION_PATH = new RegExp(`^/api/sessions/${SESSION}$`);
const AVAILABILITY = {
  method: 'GET',
  path: '/api/grading/availability',
  body: { data: { model: 'test-model', heartbeat: makeHeartbeat() } },
};

/** A session with one graded revision, and whatever the case adds. */
function sessionRoutes(overrides: {
  session?: Partial<ReturnType<typeof makeSession>>;
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
    {
      path: SESSION_PATH,
      body: { data: makeSession({ id: SESSION, ...overrides.session }) },
    },
    { path: '/api/prompts/prompt-1', body: { data: makePrompt() } },
    {
      path: `/api/sessions/${SESSION}/revisions`,
      body: { data: revisions, meta: { total: revisions.length, limit: 50, offset: 0 } },
    },
    { path: `/api/sessions/${SESSION}/improve`, body: { data: overrides.coachingRuns ?? [] } },
    { method: 'PUT', path: `/api/sessions/${SESSION}/draft`, status: 204 },
    { path: /^\/api\/revisions\/[^/]+$/, body: { data: makeRevision() } },
    { path: /^\/api\/revisions\/[^/]+\/evaluation$/, body: { data: makeEvaluation() } },
    AVAILABILITY,
    ...(overrides.extra ?? []),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PracticeWorkspace on open', () => {
  it('[UX-15] restores a saved draft ahead of the latest user revision on open, and loads the latest user revision — never an assistant one — when there is none', async () => {
    const revisions = [
      makeRevisionSummary({ id: 'rev-3', revisionNumber: 3, origin: 'assistant' }),
      makeRevisionSummary({ id: 'rev-2', revisionNumber: 2, origin: 'user' }),
    ];
    const draft = {
      graph: {
        nodes: [
          { id: 'd-1', kind: 'client' as const, label: 'Draft client' },
          { id: 'd-2', kind: 'cache' as const, label: 'Draft cache' },
        ],
        edges: [],
      },
      brief: null,
      narrative: null,
    };
    const withDraft = stubApi(sessionRoutes({ session: { draft }, revisions }));
    const first = renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Narrative' }));
    expect(screen.getByTestId('narrative-rationale-d-1')).toBeTruthy();
    expect(screen.getByTestId('narrative-rationale-d-2')).toBeTruthy();
    expect(screen.queryByTestId('narrative-rationale-n-1')).toBeNull();
    // A draft the server handed back is saved work: nothing to write until it is edited.
    expect(screen.getByTestId('draft-status').textContent).toBe('draft saved');
    // The canvas shows that draft, so no revision is current — the feedback is about #2, and says so.
    expect(screen.getByTestId('feedback-off-canvas')).toBeTruthy();
    expect(screen.queryByTestId('readonly-banner')).toBeNull();
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #2 · graded');
    // The draft is the canvas; no revision body is fetched (its grade still is).
    expect(withDraft.calls.some((call) => /^\/api\/revisions\/[^/]+$/.test(call.url))).toBe(false);
    first.unmount();
    vi.unstubAllGlobals();

    const withoutDraft = stubApi(sessionRoutes({ session: { draft: null }, revisions }));
    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Narrative' }));
    expect(screen.getByTestId('narrative-rationale-n-1')).toBeTruthy();
    expect(screen.queryByTestId('draft-status')).toBeNull();
    expect(withoutDraft.calls.some((call) => call.url === '/api/revisions/rev-2')).toBe(true);
    expect(withoutDraft.calls.some((call) => call.url === '/api/revisions/rev-3')).toBe(false);
  });

  it('[DEL-4] a latest revision that was never graded shows the notice and fetches no evaluation', async () => {
    const { calls } = stubApi(
      sessionRoutes({
        revisions: [makeRevisionSummary({ evaluation: null })],
        extra: [],
      }),
    );

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Feedback' }));
    expect(screen.getByTestId('evaluation-ungraded').getAttribute('data-reason')).toBe('never');
    expect(screen.getByTestId('retry-evaluation')).toBeTruthy();
    expect(calls.some((call) => call.url.endsWith('/evaluation'))).toBe(false);
  });

  it('[UX-15] a revision on screen is read-only until it is restored as the draft', async () => {
    stubApi(sessionRoutes({}));

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Revisions' }));
    await userEvent.click(screen.getByTestId('revision-chip-1'));

    expect(await screen.findByTestId('readonly-banner')).toBeTruthy();
    expect((screen.getByTestId('submit-revision') as HTMLButtonElement).disabled).toBe(true);
    // The palette is locked as well — the store is the one switch, so no
    // block can be added behind the banner and then restored as the draft.
    expect((screen.getByTestId('palette-cache') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('blocks-hint').textContent).not.toContain('Drag onto the canvas');
    await userEvent.click(screen.getByRole('tab', { name: 'Brief' }));
    expect((screen.getByTestId('binding-claim-c1') as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Narrative' }));
    expect((screen.getByTestId('narrative-overview') as HTMLTextAreaElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Restore as draft' }));
    expect(screen.queryByTestId('readonly-banner')).toBeNull();
    expect((screen.getByTestId('submit-revision') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('palette-cache') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('narrative-overview') as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.getByTestId('draft-status').textContent).toBe('unsaved draft');
  });

  it('[UX-15] says which revision the canvas shows and whose feedback is on show — and tells them apart once the canvas is the draft', async () => {
    const revisions = [
      makeRevisionSummary({ id: 'rev-2', revisionNumber: 2, origin: 'assistant' }),
      makeRevisionSummary(),
    ];
    stubApi([
      {
        path: '/api/revisions/rev-2',
        body: { data: makeRevision({ id: 'rev-2', revisionNumber: 2, origin: 'assistant' }) },
      },
      ...sessionRoutes({ revisions }),
    ]);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Revisions' }));

    // Opened on the author's latest revision, unedited: it is what the canvas shows.
    expect(screen.getByTestId('revision-chip-1').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('feedback-subject').textContent).toContain('revision #1');
    expect(screen.queryByTestId('feedback-off-canvas')).toBeNull();

    // The coach's revision loaded read-only: the canvas and the feedback both move to it,
    // while the toolbar still reports the author's own latest submission, named as that.
    await userEvent.click(screen.getByTestId('revision-chip-2'));
    expect(await screen.findByTestId('readonly-banner')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Revisions' }));
    expect(screen.getByTestId('revision-chip-2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('revision-chip-1').hasAttribute('aria-current')).toBe(false);
    expect(screen.getByTestId('feedback-subject').textContent).toContain('revision #2');
    expect(screen.getByTestId('feedback-subject').textContent).toContain('AI');
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #1 · graded');

    // Restored as the draft: the canvas shows no revision any more. No chip is
    // current, and the feedback says it is about #2, not what is drawn now.
    await userEvent.click(screen.getByRole('button', { name: 'Restore as draft' }));
    for (const chip of screen.getAllByTestId(/^revision-chip-/)) {
      expect(chip.hasAttribute('aria-current')).toBe(false);
    }
    expect(screen.getByTestId('revision-chip-2').getAttribute('data-place')).toBe('feedback');
    expect(screen.getByTestId('feedback-off-canvas').textContent).toBe(
      'The canvas shows your draft, not this revision.',
    );
    expect(screen.getByTestId('submission-status').textContent).toBe('submitted #1 · graded');
  });

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
      decisionBasis: { factor: 'evidence', remediations: 0, criteria: { assessed: 0, total: 3 } },
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

describe('PracticeWorkspace loading a revision over the draft', () => {
  it('[UX-15] asks before the canvas is replaced in words that match the autosave — never "unsaved" for a saved draft', async () => {
    const draft = {
      graph: { nodes: [{ id: 'd-1', kind: 'client' as const, label: 'Draft client' }], edges: [] },
      brief: null,
      narrative: null,
    };
    stubApi(sessionRoutes({ session: { draft } }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Revisions' }));
    await waitFor(
      () => expect(screen.getByTestId('draft-status').textContent).toBe('draft saved'),
      {
        timeout: 4000,
      },
    );
    await userEvent.click(screen.getByTestId('revision-chip-1'));

    expect(confirm).toHaveBeenCalledWith(LOAD_REVISION_CONFIRM.saved);
    expect(LOAD_REVISION_CONFIRM.saved).not.toMatch(/unsaved/i);
    expect(screen.queryByTestId('readonly-banner')).toBeNull();
  });

  it('[UX-15] asks nothing when there is no draft to lose', async () => {
    stubApi(sessionRoutes({}));
    const confirm = vi.spyOn(window, 'confirm');

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Revisions' }));
    await userEvent.click(screen.getByTestId('revision-chip-1'));

    expect(await screen.findByTestId('readonly-banner')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
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

describe('PracticeWorkspace after a failed coaching run', () => {
  it('[UX-11] still offers the previous run’s best revision', async () => {
    const revisions = [
      makeRevisionSummary({
        id: 'rev-2',
        revisionNumber: 2,
        origin: 'assistant',
        evaluation: {
          runId: 'run-1',
          iteration: 2,
          status: 'complete',
          overall: 80,
          decision: 'accept',
        },
      }),
      makeRevisionSummary(),
    ];
    stubApi(
      sessionRoutes({
        revisions,
        coachingRuns: [
          {
            runId: 'run-9',
            baseRevisionId: 'rev-1',
            maxIterations: 2,
            startedAt: '2026-08-20T12:05:00.000Z',
          },
          {
            runId: 'run-1',
            baseRevisionId: 'rev-1',
            maxIterations: 2,
            startedAt: '2026-08-20T12:00:00.000Z',
          },
        ],
        extra: [
          {
            path: `/api/sessions/${SESSION}/improve/run-9`,
            body: {
              data: makeImproveRun({
                runId: 'run-9',
                status: 'failed',
                iterations: [],
                error: 'the model went away',
              }),
            },
          },
        ],
      }),
    );

    renderWithTheme(<PracticeWorkspace sessionId={SESSION} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Coach' }));

    expect((await screen.findByTestId('improvement-error')).textContent).toContain(
      'the model went away',
    );
    expect(screen.getByTestId('load-earlier-best').textContent).toBe('Load revision #2');
  });
});
