import { ALL_GOOGLE_SCOPES } from './env';
import {
  GoogleAuth,
  GoogleAuthFailed,
  GoogleAuthRevoked,
  GoogleScopeMissing,
  GoogleTokenMissing,
  loadGrant,
  TOKEN_ENDPOINT,
  type Grant,
} from './oauth';
import { fakeGoogleFetch, json } from './testing';
import type { StoredToken, TokenFileSystem } from './token-file';

const grant: Grant = {
  clientId: 'client',
  clientSecret: 'secret',
  refreshToken: 'rt-1',
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
};
const stored: StoredToken = {
  refreshToken: grant.refreshToken,
  scopes: [...grant.scopes],
  clientId: grant.clientId,
  obtainedAt: '2026-10-16T12:00:00.000Z',
};

describe('the grant and the access tokens minted from it', () => {
  it('[GGL-3] is loaded from the variable when set, covering every scope, else from the file, and refused by name when there is neither', () => {
    const file: TokenFileSystem = { read: () => JSON.stringify(stored), write: () => undefined };
    const credentials = {
      clientId: 'client',
      clientSecret: 'secret',
      tokenFile: 'static/google/oauth-token.json',
      refreshToken: null,
    };
    expect(loadGrant(credentials, 'GOOGLE_OAUTH_REFRESH_TOKEN', file)).toEqual(grant);
    expect(
      loadGrant({ ...credentials, refreshToken: 'rt-env' }, 'GOOGLE_OAUTH_REFRESH_TOKEN', file),
    ).toEqual({
      ...grant,
      refreshToken: 'rt-env',
      scopes: ALL_GOOGLE_SCOPES,
    });
    const none: TokenFileSystem = { read: () => null, write: () => undefined };
    expect(() => loadGrant(credentials, 'GOOGLE_OAUTH_REFRESH_TOKEN', none)).toThrow(
      GoogleTokenMissing,
    );
    expect(() => loadGrant(credentials, 'GOOGLE_OAUTH_REFRESH_TOKEN', none)).toThrow(
      'static/google/oauth-token.json does not exist and GOOGLE_OAUTH_REFRESH_TOKEN is unset — run `authorize` first',
    );
  });

  it('[GGL-3] mints a token once, keeps it until a minute before it expires, mints again after a refusal, and names the command on a revoked grant', async () => {
    let answers = 0;
    const google = fakeGoogleFetch({
      [`POST ${TOKEN_ENDPOINT}`]: () =>
        json({ access_token: `at-${++answers}`, expires_in: 3600, token_type: 'Bearer' }),
    });
    let now = 1_000_000;
    const auth = new GoogleAuth(grant, google.fetch, () => now);
    expect(await auth.accessToken()).toBe('at-1');
    expect(await auth.accessToken()).toBe('at-1');
    expect(google.calls).toHaveLength(1);
    expect(google.calls[0]?.body).toEqual({
      client_id: 'client',
      client_secret: 'secret',
      refresh_token: 'rt-1',
      grant_type: 'refresh_token',
    });
    now += 3600_000 - 59_000;
    expect(await auth.accessToken()).toBe('at-2');
    auth.invalidate();
    expect(await auth.accessToken()).toBe('at-3');
    // Two callers at once share one minting.
    const both = new GoogleAuth(grant, google.fetch, () => now);
    const [a, b] = await Promise.all([both.accessToken(), both.accessToken()]);
    expect(a).toBe(b);
    expect(google.calls).toHaveLength(4);

    const revoked = fakeGoogleFetch({
      [`POST ${TOKEN_ENDPOINT}`]: () =>
        json(
          { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
          400,
        ),
    });
    await expect(new GoogleAuth(grant, revoked.fetch).accessToken()).rejects.toThrow(
      GoogleAuthRevoked,
    );
    await expect(new GoogleAuth(grant, revoked.fetch).accessToken()).rejects.toThrow(
      'run `authorize` again',
    );
    const broken = fakeGoogleFetch({ [`POST ${TOKEN_ENDPOINT}`]: () => json({ nope: true }) });
    await expect(new GoogleAuth(grant, broken.fetch).accessToken()).rejects.toThrow(
      GoogleAuthFailed,
    );
    const dead = fakeGoogleFetch({
      [`POST ${TOKEN_ENDPOINT}`]: () => Promise.reject(new Error('ECONNRESET')),
    });
    await expect(new GoogleAuth(grant, dead.fetch).accessToken()).rejects.toThrow(
      'could not be reached',
    );
  });

  it('[GGL-3] refuses a program whose scopes the grant lacks, naming the scope and the command', () => {
    const auth = new GoogleAuth(grant);
    expect(() => auth.assertScopes(grant.scopes, 'mailbox')).not.toThrow();
    expect(() =>
      auth.assertScopes(['https://www.googleapis.com/auth/calendar'], 'calendar'),
    ).toThrow(GoogleScopeMissing);
    expect(() =>
      auth.assertScopes(['https://www.googleapis.com/auth/calendar'], 'calendar'),
    ).toThrow(
      'the grant lacks https://www.googleapis.com/auth/calendar, which calendar needs: run `authorize`',
    );
  });
});
