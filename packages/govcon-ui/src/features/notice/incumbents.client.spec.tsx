import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INCUMBENTS } from '../../testing/spending-fixtures';
import { IncumbentsLens } from './incumbents.client';

afterEach(() => vi.unstubAllGlobals());

describe('IncumbentsLens', () => {
  it('[GOVU-24] asks the award source nothing until asked to, then reads the notice’s incumbents narrowed to its product service code, and asks again when the narrowing is unticked', async () => {
    const { calls } = stubApi([{ path: '/spending/incumbents/n-1', body: { data: INCUMBENTS } }]);
    renderWithTheme(<IncumbentsLens noticeId="n-1" noticePsc="5340" />);
    expect(screen.getByRole('heading', { name: 'Who holds this work' })).toBeTruthy();
    expect(calls).toEqual([]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Look for awards ending at this buyer — free' }),
    );
    await screen.findByRole('table', { name: 'Awards that may hold this work' });
    expect(calls.map((call) => call.url)).toEqual(['/spending/incumbents/n-1?samePsc=true']);

    fireEvent.click(screen.getByLabelText('Only under PSC 5340'));
    await waitFor(() =>
      expect(calls.map((call) => call.url)).toEqual([
        '/spending/incumbents/n-1?samePsc=true',
        '/spending/incumbents/n-1?samePsc=false',
      ]),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Read again — free' }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.at(-1)?.url).toBe('/spending/incumbents/n-1?samePsc=false');
  });

  it('[GOVU-24] unticking before anything was asked asks nothing, and a refused read is said beside the button', async () => {
    const { calls } = stubApi([
      {
        path: '/spending/incumbents/n-1',
        status: 502,
        body: { statusCode: 502, message: 'error: status 503' },
      },
    ]);
    renderWithTheme(<IncumbentsLens noticeId="n-1" noticePsc="5340" />);
    fireEvent.click(screen.getByLabelText('Only under PSC 5340'));
    expect(calls).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Look for awards ending at this buyer — free' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe('error: status 503');
    expect(calls.map((call) => call.url)).toEqual(['/spending/incumbents/n-1?samePsc=false']);
  });
});
