import { PRACTICE_FORMATS } from '@sysdesign/contracts';
import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeInterviewState, makeTurn } from '../../../testing/fixtures';
import { InterviewPanel } from './interview-panel';

afterEach(() => {
  vi.unstubAllGlobals();
});

const STATE = '/api/sessions/session-1/interview';
const format = PRACTICE_FORMATS.interview;

describe('InterviewPanel', () => {
  it('[UX-27] shows the phase, every turn with the interviewer’s decision, and offers what the current phase declares: ask, answer, move on', async () => {
    const api = stubApi([{ path: STATE, body: { data: makeInterviewState() } }]);
    const seen: number[] = [];
    renderWithTheme(
      <InterviewPanel
        sessionId="session-1"
        format={format}
        readOnly={false}
        onState={(state) => seen.push(state.turns.length)}
      />,
    );
    const panel = await screen.findByTestId('interview-panel');
    expect(within(panel).getByTestId('phase-timer').textContent).toContain('Clarify');
    const turns = within(panel).getAllByTestId('interview-turn');
    expect(turns.map((turn) => turn.getAttribute('data-role'))).toEqual([
      'candidate',
      'interviewer',
    ]);
    expect(within(turns[1] ?? panel).getByTestId('turn-decision').textContent).toBe('Accept');
    expect(within(panel).getByTestId('interview-ask').hasAttribute('disabled')).toBe(true);
    expect(within(panel).getByTestId('interview-advance').textContent).toBe('Move on to design');
    expect(within(panel).queryByTestId('interview-probe')).toBeNull();
    expect(seen).toEqual([2]);
    expect(api.calls.filter((call) => call.method === 'GET')).toHaveLength(1);
  });

  it('[UX-27] [DEL-10] asking posts the questions one per line and reads again; while a reply is pending the controls wait and the turn says so', async () => {
    let asked = false;
    stubApi([
      {
        path: STATE,
        handler: () => ({
          body: {
            data: asked
              ? makeInterviewState({
                  turns: [
                    makeTurn({ text: 'Who are the users?' }),
                    makeTurn({ id: 'turn-2', ordinal: 2, text: 'How many?' }),
                    makeTurn({
                      id: 'turn-3',
                      ordinal: 3,
                      role: 'interviewer',
                      text: '',
                      runId: 'fake-run-2',
                    }),
                  ],
                  pending: { runId: 'fake-run-2', status: 'running', error: null },
                })
              : makeInterviewState({ turns: [] }),
          },
        }),
      },
      {
        path: '/api/sessions/session-1/interview/clarify',
        method: 'POST',
        handler: () => {
          asked = true;
          return { status: 202, body: { data: { runId: 'fake-run-2', status: 'running' } } };
        },
      },
    ]);
    renderWithTheme(<InterviewPanel sessionId="session-1" format={format} readOnly={false} />);
    expect(await screen.findByTestId('interview-empty')).toBeTruthy();
    const box = screen.getByLabelText('To the interviewer');
    await userEvent.type(box, 'Who are the users?{enter}How many?');
    await userEvent.click(screen.getByTestId('interview-ask'));
    await waitFor(() => expect(screen.getByTestId('interview-pending')).toBeTruthy());
    const turns = screen.getAllByTestId('interview-turn');
    expect(turns).toHaveLength(3);
    expect(turns[2]?.textContent).toContain('The interviewer is answering…');
    expect(screen.getByTestId('interview-ask').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('interview-advance').hasAttribute('disabled')).toBe(true);
  });

  it('[UX-27] [DEL-9] in the design phase the panel offers the deep dive, in the deep dive it points at the submit, and read-only shows the transcript alone', async () => {
    stubApi([
      {
        path: STATE,
        body: {
          data: makeInterviewState({
            phase: 'design',
            phases: [
              {
                id: 'clarify',
                startedAt: '2026-10-20T10:00:00.000Z',
                endedAt: '2026-10-20T10:08:00.000Z',
              },
              { id: 'design', startedAt: '2026-10-20T10:08:00.000Z', endedAt: null },
            ],
          }),
        },
      },
    ]);
    const { unmount } = renderWithTheme(
      <InterviewPanel sessionId="session-1" format={format} readOnly={false} />,
    );
    const panel = await screen.findByTestId('interview-panel');
    expect(within(panel).getByTestId('interview-probe').textContent).toBe('Open the deep dive');
    expect(within(panel).queryByTestId('interview-advance')).toBeNull();
    unmount();
    vi.unstubAllGlobals();

    stubApi([{ path: STATE, body: { data: makeInterviewState({ phase: 'deep-dive' }) } }]);
    const second = renderWithTheme(
      <InterviewPanel sessionId="session-1" format={format} readOnly={false} />,
    );
    expect(await screen.findByTestId('interview-submit-hint')).toBeTruthy();
    second.unmount();
    vi.unstubAllGlobals();

    stubApi([{ path: STATE, body: { data: makeInterviewState() } }]);
    renderWithTheme(<InterviewPanel sessionId="session-1" format={format} readOnly />);
    await screen.findByTestId('interview-panel');
    expect(screen.queryByLabelText('To the interviewer')).toBeNull();
    expect(screen.getAllByTestId('interview-turn')).toHaveLength(2);
  });
});
