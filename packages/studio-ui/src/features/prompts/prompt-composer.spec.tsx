import type * as WebTesting from '@sysdesign/web-testing';
import { renderWithTheme, resetNavigationMock, routerMock, stubApi } from '@sysdesign/web-testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeExperience, makeLibraryDocument, makePrompt } from '../../testing/fixtures';
import { PromptComposer } from './prompt-composer.client';

// `importActual` rather than `import()`: the factory is hoisted above the
// static imports, and a dynamic import would make Nx read the harness as a
// lazy-loaded library and reject the static imports above.
vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const EXPERIENCES = {
  path: '/api/experiences',
  body: { data: [makeExperience()], meta: { total: 1, limit: 50, offset: 0 } },
};
const LIBRARY = {
  path: '/api/prompts/library',
  body: { data: [{ id: 'order-history', title: 'Order history integration' }] },
};

beforeEach(() => {
  resetNavigationMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PromptComposer', () => {
  it('[GEN-2] authors a prompt from a title and markdown and opens it', async () => {
    const user = userEvent.setup();
    const { fetchMock } = stubApi([
      EXPERIENCES,
      LIBRARY,
      { method: 'POST', path: '/api/prompts', status: 201, body: { data: makePrompt() } },
    ]);

    renderWithTheme(<PromptComposer />);

    expect((screen.getByTestId('compose-submit') as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByTestId('compose-title'), 'Design an order-history service');
    await user.type(screen.getByTestId('compose-markdown'), '# Design it');
    await waitFor(() => expect(screen.getByRole('option', { name: /TicketWave/ })).toBeTruthy());
    await user.selectOptions(screen.getByTestId('compose-experience'), 'exp-1');
    await user.click(screen.getByTestId('compose-submit'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/prompts/prompt-1'));
    const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === 'POST');
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({
      title: 'Design an order-history service',
      markdown: '# Design it',
      experienceId: 'exp-1',
    });
  });

  it('[GEN-3] previews a library document and imports it', async () => {
    const user = userEvent.setup();
    const { calls } = stubApi([
      EXPERIENCES,
      LIBRARY,
      { path: '/api/prompts/library/order-history', body: { data: makeLibraryDocument() } },
      {
        method: 'POST',
        path: '/api/prompts/import',
        status: 201,
        body: { data: makePrompt({ id: 'prompt-2', source: 'library' }) },
      },
    ]);

    renderWithTheme(<PromptComposer />);
    await user.click(screen.getByRole('tab', { name: 'Import from the library' }));

    await user.click(await screen.findByTestId('library-entry-order-history'));
    expect(await screen.findByTestId('library-preview')).toBeTruthy();
    await user.click(screen.getByTestId('import-submit'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/prompts/prompt-2'));
    expect(calls.some((call) => call.url === '/api/prompts/library/order-history')).toBe(true);
  });

  it('shows the API’s refusal instead of navigating', async () => {
    const user = userEvent.setup();
    stubApi([
      EXPERIENCES,
      LIBRARY,
      {
        method: 'POST',
        path: '/api/prompts',
        status: 422,
        body: { statusCode: 422, message: 'unknown experience' },
      },
    ]);

    renderWithTheme(<PromptComposer />);
    await user.type(screen.getByTestId('compose-title'), 'T');
    await user.type(screen.getByTestId('compose-markdown'), 'M');
    await user.click(screen.getByTestId('compose-submit'));

    expect((await screen.findByTestId('compose-error')).textContent).toBe('unknown experience');
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
