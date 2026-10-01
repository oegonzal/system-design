import { PROMPT_COPY } from '@sysdesign/contracts';
import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makePrompt } from '../../testing/fixtures';
import { PromptDetail } from './prompt-detail.client';

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

describe('PromptDetail', () => {
  it('[GEN-1] a generated prompt offers no re-derive; an authored one does', async () => {
    const { calls } = stubApi([
      { path: '/api/prompts/prompt-1', body: { data: makePrompt({ source: 'generated' }) } },
    ]);
    const generated = renderWithTheme(<PromptDetail promptId="prompt-1" />);

    expect(await screen.findByTestId('start-practice')).toBeTruthy();
    expect(screen.getByTestId('prompt-source').textContent).toBe('Generated');
    expect(screen.queryByTestId('rederive-criteria')).toBeNull();
    expect(screen.getByTestId('criterion-c1')).toBeTruthy();
    expect(calls.some((call) => call.url.endsWith('/criteria'))).toBe(false);
    generated.unmount();
    vi.unstubAllGlobals();

    stubApi([{ path: '/api/prompts/prompt-1', body: { data: makePrompt() } }]);
    renderWithTheme(<PromptDetail promptId="prompt-1" />);

    expect(await screen.findByTestId('rederive-criteria')).toBeTruthy();
  });

  it('[UX-14] titles the page with the prompt — its one h1 — and names the tab after it', async () => {
    stubApi([{ path: '/api/prompts/prompt-1', body: { data: makePrompt() } }]);
    renderWithTheme(<PromptDetail promptId="prompt-1" />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design an order-history service' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await waitFor(() =>
      expect(document.title).toBe('Design an order-history service · System Design Studio'),
    );
  });

  it('[UX-14] says why re-derive is off once sessions fix the rubric, and why practice is off while archived', async () => {
    stubApi([
      {
        path: '/api/prompts/prompt-1',
        body: { data: makePrompt({ rubricLocked: true, status: 'archived' }) },
      },
    ]);
    renderWithTheme(<PromptDetail promptId="prompt-1" />);

    const rederive = (await screen.findByTestId('rederive-criteria')) as HTMLButtonElement;
    expect(rederive.disabled).toBe(true);
    expect(
      document.getElementById(rederive.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe(PROMPT_COPY.criteriaLocked);
    const start = screen.getByTestId('start-practice') as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(document.getElementById(start.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      PROMPT_COPY.archived,
    );
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeTruthy();
  });

  it('[UX-12] calls a missing or malformed prompt not found, with the way back to the prompts', async () => {
    stubApi([
      {
        path: '/api/prompts/not-a-uuid',
        status: 400,
        body: { statusCode: 400, message: 'Validation failed (uuid is expected)' },
      },
    ]);
    renderWithTheme(<PromptDetail promptId="not-a-uuid" />);

    expect(await screen.findByRole('heading', { name: 'Prompt not found' })).toBeTruthy();
    expect(screen.queryByText(/uuid is expected/)).toBeNull();
    expect(screen.queryByTestId('notice-retry')).toBeNull();
    const back = screen.getByTestId('notice-back');
    expect(back.getAttribute('href')).toBe('/prompts');
    expect(back.textContent).toBe('Back to your prompts');
  });

  it('[UX-12] offers a Retry for a load that failed, in words a person can read, and loads on it', async () => {
    const user = userEvent.setup();
    let down = true;
    stubApi([
      {
        path: '/api/prompts/prompt-1',
        handler: () => {
          if (down) throw new TypeError('Failed to fetch');
          return { body: { data: makePrompt() } };
        },
      },
    ]);
    renderWithTheme(<PromptDetail promptId="prompt-1" />);

    expect(await screen.findByRole('heading', { name: "Couldn't load this prompt" })).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();

    down = false;
    await user.click(screen.getByTestId('notice-retry'));
    expect(await screen.findByTestId('start-practice')).toBeTruthy();
  });
});
