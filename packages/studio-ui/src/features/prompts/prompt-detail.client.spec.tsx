import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, stubApi } from '@sysdesign/web-testing';
import { screen } from '@testing-library/react';
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
    expect(screen.getByTestId('prompt-source').textContent).toBe('generated');
    expect(screen.queryByTestId('rederive-criteria')).toBeNull();
    expect(screen.getByTestId('criterion-c1')).toBeTruthy();
    expect(calls.some((call) => call.url.endsWith('/criteria'))).toBe(false);
    generated.unmount();
    vi.unstubAllGlobals();

    stubApi([{ path: '/api/prompts/prompt-1', body: { data: makePrompt() } }]);
    renderWithTheme(<PromptDetail promptId="prompt-1" />);

    expect(await screen.findByTestId('rederive-criteria')).toBeTruthy();
  });
});
