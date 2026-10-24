import type { IntroductionDto } from '@sysdesign/contracts';
import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TARGET } from '../../testing/pipeline-fixtures';
import { IntroductionDraft } from './introduction.client';

const READY: IntroductionDto = {
  runId: 'run-1',
  status: 'ready',
  note: {
    subject: 'Small-business engineering capacity for 89303019FET000003',
    body: 'Dear the small business liaison team at BOOZ ALLEN HAMILTON INC,\n\nI lead a small software firm.',
  },
  decision: 'accept',
  overall: 88,
  reason: null,
};

describe('IntroductionDraft', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('[GOVU-29] drafts an introduction for the tracked award in one click, asks after the run until the note is ready, shows it with the decision and the score, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { calls } = stubApi([
      { path: `/targets/award/${TARGET.subject}`, body: { data: TARGET } },
      { method: 'POST', path: '/introductions', status: 202, body: { data: { runId: 'run-1' } } },
      { path: '/introductions/run-1', body: { data: READY } },
    ]);
    renderWithTheme(<IntroductionDraft awardExternalId={TARGET.subject} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Draft an introduction' }));
    await screen.findByText(READY.note?.subject ?? '');
    expect(screen.getByText('accept · 88')).toBeTruthy();
    expect(screen.getByText(/Logged on the target as a draft/)).toBeTruthy();
    const started = calls.find((call) => call.method === 'POST');
    expect(started?.url).toBe('/introductions');
    expect(
      calls.some(
        (call) => call.url === `/introductions/run-1?kind=award&subject=${TARGET.subject}`,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${READY.note?.subject}\n\n${READY.note?.body}`),
    );
  });

  it('[GOVU-29] offers nothing for an untracked award but says what tracking it would allow, and reopens the latest draft a tracked award’s log points at', async () => {
    const first = stubApi([{ path: `/targets/award/${TARGET.subject}`, body: { data: null } }]);
    const untracked = renderWithTheme(<IntroductionDraft awardExternalId={TARGET.subject} />);
    await screen.findByText(/Track this award, then a note to its holder can be drafted here/);
    expect(screen.queryByRole('button', { name: 'Draft an introduction' })).toBeNull();
    expect(first.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    untracked.unmount();
    vi.unstubAllGlobals();

    stubApi([
      {
        path: `/targets/award/${TARGET.subject}`,
        body: {
          data: {
            ...TARGET,
            activity: [
              {
                at: '2026-09-27T12:00:00.000Z',
                kind: 'drafted',
                summary: 'An older note',
                ref: 'run-7',
              },
              {
                at: '2026-09-28T12:00:00.000Z',
                kind: 'drafted',
                summary: READY.note?.subject,
                ref: 'run-9',
              },
            ],
          },
        },
      },
      { path: '/introductions/run-9', body: { data: { ...READY, runId: 'run-9' } } },
    ]);
    renderWithTheme(<IntroductionDraft awardExternalId={TARGET.subject} />);
    await screen.findByText(READY.note?.subject ?? '');
    expect(screen.getByRole('button', { name: 'Draft again' })).toBeTruthy();
  });
});
