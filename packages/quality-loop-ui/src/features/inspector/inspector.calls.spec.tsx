import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  setMockSearchParams,
  stubApi,
} from '@sysdesign/web-testing';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorClient } from './inspector.client';
import {
  advance,
  complete,
  lastSelectedKey,
  ORCHESTRATIONS,
  PIPELINES,
  rail,
  RUNS,
} from './testing';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  vi.useFakeTimers();
  resetNavigationMock();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('InspectorClient', () => {
  it('[QLU-13] the model calls are the run’s own log, reachable from anywhere in the rail', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
      { path: `/runs/${complete.runId}/dump`, body: { data: [] } },
    ]);
    setMockSearchParams({ run: complete.runId });
    const { rerender } = renderWithTheme(<InspectorClient />);
    await advance(0);

    // Select the FIRST action. The call actions land at the tail of the log, so a
    // panel filtered to the selected action would be empty here — and a reader
    // could reach a prompt only from the end. A call's ordinal counts attempts,
    // so it cannot be placed in the loop's order at all; the honest reading is
    // the whole run's calls, wherever the rail sits.
    const first = within(rail()).getAllByRole('button')[0];
    fireEvent.click(first);
    setMockSearchParams({ run: complete.runId, action: lastSelectedKey() ?? '' });
    await act(async () => {
      rerender(<InspectorClient />);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Model calls' }));
    await advance(0);
    const table = screen.getByRole('table', { name: 'Model calls' });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(complete.exchanges.length);
    expect(screen.getByText(/wherever you are in the rail/)).toBeTruthy();
  });

  it('[QLU-13] opens the prompt that produced a named finding, read out of the dump', async () => {
    const PROMPT = '# Goal\n\nThe worker polls every five minutes.';
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
      {
        path: `/runs/${complete.runId}/dump`,
        body: {
          data: [
            { path: 'manifest.json', bytes: 100 },
            { path: '05-llm/03.critic.requirements.s1.1.system.txt', bytes: 900 },
            { path: '05-llm/03.critic.requirements.s1.1.user.txt', bytes: 4200 },
            { path: '05-llm/03.critic.requirements.s1.1.response.json', bytes: 1800 },
          ],
        },
      },
      {
        path: '/runs/' + complete.runId + '/dump/05-llm/03.critic.requirements.s1.1.user.txt',
        body: {
          data: {
            path: '05-llm/03.critic.requirements.s1.1.user.txt',
            bytes: 4200,
            text: PROMPT,
            problem: null,
          },
        },
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Model calls' }));
    await advance(0);
    // The call that produced the finding — the critic's own sample.
    fireEvent.click(screen.getByRole('button', { name: 'critic.requirements.s1' }));
    await advance(0);

    const files = screen.getByRole('table', { name: 'Files for critic.requirements.s1' });
    expect([...files.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual([
      expect.stringContaining('system prompt'),
      expect.stringContaining('user prompt'),
      expect.stringContaining('raw reply'),
    ]);
    // The manifest is not this call's file, and neither is any other scope's.
    expect(files.textContent).not.toContain('manifest.json');

    fireEvent.click(
      screen.getByRole('button', { name: '05-llm/03.critic.requirements.s1.1.user.txt' }),
    );
    await advance(0);
    // The bytes exactly as the loop wrote them, which is the whole point.
    expect(screen.getAllByText(/The worker polls every five minutes/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('05-llm/03.critic.requirements.s1.1.user.txt').textContent).toBe(
      PROMPT,
    );
  });

  it('[QLU-13] a run with no dump says so where the transcript would be, and nothing else breaks', async () => {
    stubApi([
      RUNS,
      PIPELINES,
      ORCHESTRATIONS,
      { path: `/runs/${complete.runId}`, body: { data: complete } },
      {
        path: `/runs/${complete.runId}/dump`,
        status: 404,
        body: { message: 'no dump recorded for run x' },
      },
    ]);
    setMockSearchParams({ run: complete.runId });
    renderWithTheme(<InspectorClient />);
    await advance(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Model calls' }));
    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: 'criteria' }));
    await advance(0);

    // The listing is still there: a missing dump costs the transcript, not the run.
    expect(screen.getByRole('table', { name: 'Model calls' })).toBeTruthy();
    expect(screen.getByText(/no dump recorded/)).toBeTruthy();
  });
});
