import { renderWithTheme, stubApi } from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TARGET } from '../../testing/fixtures';
import { TrackTarget } from './track-target.client';

const PATH = `/targets/award/${TARGET.subject}`;
const mount = () =>
  renderWithTheme(<TrackTarget kind="award" subject={TARGET.subject} label={TARGET.label} />);

afterEach(() => vi.unstubAllGlobals());

describe('TrackTarget', () => {
  it('[GOVU-20] asks the store whether the thing is tracked, tracks it in one write under the name the page gives it, shows what the write answered with a way to the pipeline, and stops tracking it in one more', async () => {
    let stored: typeof TARGET | null = null;
    const { calls, fetchMock } = stubApi([
      { path: PATH, handler: () => ({ body: { data: stored } }) },
      {
        method: 'PUT',
        path: PATH,
        handler: ({ init }) => {
          stored = { ...TARGET, ...(JSON.parse(String(init?.body)) as Partial<typeof TARGET>) };
          return { body: { data: stored } };
        },
      },
      {
        method: 'DELETE',
        path: PATH,
        handler: () => {
          stored = null;
          return { status: 204, body: undefined };
        },
      },
    ]);
    mount();
    const region = within(await screen.findByRole('region', { name: 'Tracking' }));
    await region.findByText('not tracked');
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([`GET ${PATH}`]);
    expect(region.queryByRole('link', { name: 'Every tracked firm and award' })).toBeNull();

    fireEvent.change(region.getByLabelText('Stage'), { target: { value: 'researching' } });
    fireEvent.click(region.getByRole('button', { name: 'Track this award' }));
    await screen.findByText('Tracked as researching.');
    const put = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === 'PUT');
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      label: TARGET.label,
      stage: 'researching',
      notes: '',
      contact: '',
      reminderAt: null,
    });
    // The panel shows what the write answered, without reading the store again.
    expect((region.getByLabelText('Stage') as HTMLSelectElement).value).toBe('researching');
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1);
    expect(
      region.getByRole('link', { name: 'Every tracked firm and award' }).getAttribute('href'),
    ).toBe('/pipeline?view=targets');

    fireEvent.click(region.getByRole('button', { name: 'Stop tracking' }));
    await screen.findByText('No longer tracked.');
    await region.findByText('not tracked');
    expect(calls.map((call) => call.method)).toEqual(['GET', 'PUT', 'DELETE']);
  });

  it('[GOVU-20] says when the store could not be read, and keeps what was typed when a save is refused', async () => {
    stubApi([{ path: PATH, status: 500, body: { statusCode: 500, message: 'the store is down' } }]);
    const down = mount();
    expect((await screen.findByRole('alert')).textContent).toBe('the store is down');
    expect(screen.queryByRole('button', { name: 'Track this award' })).toBeNull();
    down.unmount();
    vi.unstubAllGlobals();

    stubApi([
      { path: PATH, body: { data: null } },
      {
        method: 'PUT',
        path: PATH,
        status: 400,
        body: { statusCode: 400, message: 'contact: too long' },
      },
    ]);
    mount();
    await screen.findByText('not tracked');
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Keep this.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track this award' }));
    expect((await screen.findByRole('alert')).textContent).toBe('contact: too long');
    await waitFor(() =>
      expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Keep this.'),
    );
    expect(screen.getByText('not tracked')).toBeTruthy();
  });
});
