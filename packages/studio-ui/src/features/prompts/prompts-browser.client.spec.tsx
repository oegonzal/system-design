import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  routerMock,
  setMockPathname,
  setMockSearchParams,
  stubApi,
} from '@sysdesign/web-testing';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeExperience, makePrompt } from '../../testing/fixtures';
import { PromptsBrowser } from './prompts-browser.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

beforeEach(() => {
  resetNavigationMock();
  setMockPathname('/prompts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const EXPERIENCES = {
  path: '/api/experiences',
  body: { data: [makeExperience()], meta: { total: 1, limit: 50, offset: 0 } },
};

const promptsRoute = (data: unknown[]) => ({
  path: '/api/prompts',
  body: { data, meta: { total: data.length, limit: 50, offset: 0 } },
});

describe('PromptsBrowser', () => {
  it('[GEN-3] reads its filters from the URL — so Back and a shared link keep them — and writes a change back to it', async () => {
    const user = userEvent.setup();
    setMockSearchParams({ source: 'library', experienceId: 'exp-1' });
    const { calls } = stubApi([EXPERIENCES, promptsRoute([makePrompt({ source: 'library' })])]);

    renderWithTheme(<PromptsBrowser />);

    expect(await screen.findByTestId('prompt-list')).toBeTruthy();
    const listed = calls.find((call) => call.url.startsWith('/api/prompts?'));
    expect(listed?.url).toContain('experienceId=exp-1');
    expect(listed?.url).toContain('source=library');
    const source = screen.getByTestId('source-select') as HTMLSelectElement;
    expect(source.value).toBe('library');
    // The options read as words, the values stay the contract's tokens.
    expect([...source.options].map((option) => option.textContent)).toEqual([
      'Any source',
      'Authored',
      'Generated',
      'Library',
    ]);
    expect(within(screen.getByTestId('prompt-list')).getByText('Library')).toBeTruthy();

    await user.selectOptions(source, 'authored');
    expect(routerMock.replace).toHaveBeenCalledWith('/prompts?experienceId=exp-1&source=authored', {
      scroll: false,
    });
  });

  it('badges a prompt’s source and an archived prompt’s status in the same words', async () => {
    stubApi([
      EXPERIENCES,
      promptsRoute([
        makePrompt({ id: 'prompt-1', source: 'generated', status: 'archived' }),
        makePrompt({ id: 'prompt-2', title: 'Design a rate limiter' }),
      ]),
    ]);

    renderWithTheme(<PromptsBrowser />);

    const [archived, active] = within(await screen.findByTestId('prompt-list')).getAllByRole(
      'listitem',
    );
    expect(within(archived).getByText('Generated')).toBeTruthy();
    expect(within(archived).getByText('Archived')).toBeTruthy();
    expect(within(active).getByText('Authored')).toBeTruthy();
    expect(within(active).queryByText(/archived/i)).toBeNull();
  });

  it('says when no prompt matches the filters, and clears them in one click', async () => {
    const user = userEvent.setup();
    setMockSearchParams({ source: 'generated' });
    stubApi([EXPERIENCES, promptsRoute([])]);

    renderWithTheme(<PromptsBrowser />);

    const empty = await screen.findByTestId('prompts-empty-filtered');
    expect(empty.textContent).toContain('No prompts match these filters');
    expect(screen.queryByText(/No prompts yet/)).toBeNull();
    await user.click(screen.getByTestId('clear-filters'));
    expect(routerMock.replace).toHaveBeenCalledWith('/prompts', { scroll: false });
  });

  it('invites the first prompt when the library is truly empty, and ignores a source it does not know', async () => {
    setMockSearchParams({ source: 'nonsense' });
    const { calls } = stubApi([EXPERIENCES, promptsRoute([])]);

    renderWithTheme(<PromptsBrowser />);

    expect(await screen.findByText(/No prompts yet/)).toBeTruthy();
    expect(screen.queryByTestId('clear-filters')).toBeNull();
    expect(calls.find((call) => call.url.startsWith('/api/prompts?'))?.url).not.toContain('source');
  });
});
