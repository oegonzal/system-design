import type * as WebTesting from '@sysdesign/web-testing';
import {
  renderWithTheme,
  resetNavigationMock,
  stubApi,
  type StubRoute,
} from '@sysdesign/web-testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileProvider } from '../../providers/profile-context';
import { CALLS, OTHER_PROFILE, PROFILE, SOURCE_STATUS } from '../../testing/fixtures';
import { issuesOf, SettingsClient } from './settings.client';

vi.mock('next/navigation', async () => {
  const harness = await vi.importActual<typeof WebTesting>('@sysdesign/web-testing');
  return harness.createNextNavigationMock();
});

const baseRoutes = (): StubRoute[] => [
  { path: '/profiles', body: { data: [PROFILE, OTHER_PROFILE] } },
  { path: '/source', body: { data: SOURCE_STATUS } },
  { path: '/source/calls', body: { data: CALLS, meta: { total: 3, limit: 50, offset: 0 } } },
];

const mount = () =>
  renderWithTheme(
    <ProfileProvider>
      <SettingsClient />
    </ProfileProvider>,
  );

beforeEach(() => {
  resetNavigationMock();
  window.localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('SettingsClient', () => {
  it('[GOVU-10] edits the active profile as data, shows the service issues beside their fields on a refused save, and saves once they are fixed', async () => {
    const { calls, fetchMock } = stubApi([
      ...baseRoutes(),
      {
        method: 'PUT',
        path: '/profiles/enfav',
        handler: ({ count }) =>
          count === 0
            ? {
                status: 400,
                body: {
                  message: 'validation failed',
                  issues: [{ path: 'scoring.weights', message: 'weights sum to 1.2, not 1' }],
                },
              }
            : { body: { data: { ...PROFILE, company: 'Enfav LLC (edited)' } } },
      },
    ]);
    mount();
    await screen.findByRole('form', { name: 'Profile enfav' });
    await screen.findByRole('table', { name: 'Source calls' });
    expect(screen.getByText('sam.gov enabled')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Weight naics'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    const issue = await screen.findByText('weights sum to 1.2, not 1');
    expect(issue.getAttribute('data-path')).toBe('scoring.weights');
    expect(screen.getByText(/1 issue\(s\) — nothing was saved/)).toBeTruthy();
    const put = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/profiles/enfav'));
    const body = JSON.parse(String((put?.[1] as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 'enfav',
      scoring: expect.objectContaining({ weights: expect.objectContaining({ naics: 0.5 }) }),
    });
    expect(body).not.toHaveProperty('isDefault');
    expect(body).not.toHaveProperty('updatedAt');

    fireEvent.change(screen.getByLabelText('Weight naics'), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile enfav saved.');
    await waitFor(() => {
      expect(calls.filter((call) => call.url === '/profiles')).toHaveLength(2);
    });
  });

  it('[GOVU-10] creates a profile from the template, promotes one to default, and removes one after confirming', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { calls } = stubApi([
      ...baseRoutes(),
      {
        method: 'POST',
        path: '/profiles',
        body: { data: { ...OTHER_PROFILE, id: 'acme', company: 'Acme' } },
        status: 201,
      },
      {
        method: 'POST',
        path: '/profiles/other/default',
        body: { data: { ...OTHER_PROFILE, isDefault: true } },
      },
      { method: 'DELETE', path: '/profiles/other', status: 204 },
    ]);
    mount();
    await screen.findByRole('table', { name: 'Profiles' });
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    const form = await screen.findByRole('form', { name: 'New profile' });
    fireEvent.change(within(form).getByLabelText('Id'), { target: { value: 'acme' } });
    fireEvent.change(within(form).getByLabelText('Company'), { target: { value: 'Acme' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create profile' }));
    await screen.findByText('Profile acme saved.');
    expect(calls.map((call) => `${call.method} ${call.url}`)).toContain('POST /profiles');

    const rows = within(screen.getByRole('table', { name: 'Profiles' }))
      .getAllByRole('row')
      .slice(1);
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Set default' }));
    await screen.findByText('Profile other is now the default.');
    const again = within(screen.getByRole('table', { name: 'Profiles' }))
      .getAllByRole('row')
      .slice(1);
    fireEvent.click(within(again[1] as HTMLElement).getByRole('button', { name: 'Delete' }));
    await screen.findByText('Profile other removed.');
    expect(confirm).toHaveBeenCalled();
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(
      expect.arrayContaining(['POST /profiles/other/default', 'DELETE /profiles/other']),
    );
    confirm.mockRestore();
  });

  it('pages the ledger by operation, and reads issues only from a 400 that names them', async () => {
    const { calls } = stubApi(baseRoutes());
    mount();
    await screen.findByRole('table', { name: 'Source calls' });
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'description' } });
    await waitFor(() => {
      expect(calls.map((call) => call.url)).toContain(
        '/source/calls?limit=50&offset=0&operation=description',
      );
    });
    expect(issuesOf(new Error('x'))).toBeNull();
  });
});
