import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  makeImproveIteration,
  makeImproveRun,
  makeRevision,
  makeRevisionSummary,
} from '../../testing/fixtures';
import { PracticeWorkspace } from './practice-workspace';
import { SESSION, sessionRoutes } from './testing';

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
