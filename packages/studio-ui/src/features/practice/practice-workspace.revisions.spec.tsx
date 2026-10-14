import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeImproveRun, makeRevisionSummary } from '../../testing/fixtures';
import { PracticeWorkspace } from './practice-workspace';
import { SESSION, sessionRoutes } from './testing';
import { LOAD_REVISION_CONFIRM } from './workspace-copy';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
