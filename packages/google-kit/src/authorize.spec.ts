import { AUTH_ENDPOINT, authorize, ConsentFailed, type Listen } from './authorize';
import { TOKEN_ENDPOINT } from './oauth';
import { fakeGoogleFetch, json } from './testing';

/** A listener that hands the handler the redirect a spec chooses, as if the browser came back with it. */
const listening = (redirect: (consentUrl: URL) => string) => {
  const closed: string[] = [];
  let announced: URL | null = null;
  const listen: Listen = (port, handle) => {
    queueMicrotask(() => {
      // The redirect lands once the consent URL has been announced.
      setTimeout(() => {
        if (announced === null) throw new Error('nothing announced');
        pages.push(handle({ url: redirect(announced) }));
      }, 0);
    });
    expect(port).toBe(3010);
    return Promise.resolve({
      close: () => {
        closed.push('closed');
        return Promise.resolve();
      },
    });
  };
  const pages: string[] = [];
  return { listen, closed, pages, announce: (url: string) => (announced = new URL(url)) };
};

const options = (
  google: ReturnType<typeof fakeGoogleFetch>,
  harness: ReturnType<typeof listening>,
) => ({
  clientId: 'client',
  clientSecret: 'secret',
  scopes: [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar',
  ],
  announce: harness.announce,
  fetchImpl: google.fetch,
  listen: harness.listen,
  now: () => new Date('2026-10-16T12:00:00.000Z'),
  state: 'state-1',
});

describe('consent', () => {
  it('[GGL-4] announces the consent URL for every scope, checks the state on the way back, exchanges the code, and answers the grant with what Google granted', async () => {
    const google = fakeGoogleFetch({
      [`POST ${TOKEN_ENDPOINT}`]: () =>
        json({
          access_token: 'at',
          refresh_token: 'rt-new',
          scope:
            'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
          expires_in: 3599,
        }),
    });
    const harness = listening(
      (consent) => `/callback?state=${consent.searchParams.get('state')}&code=code-1`,
    );
    const token = await authorize(options(google, harness));
    expect(token).toEqual({
      refreshToken: 'rt-new',
      scopes: [
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/calendar',
      ],
      clientId: 'client',
      obtainedAt: '2026-10-16T12:00:00.000Z',
    });
    const [exchange] = google.calls;
    expect(exchange?.body).toEqual({
      code: 'code-1',
      client_id: 'client',
      client_secret: 'secret',
      redirect_uri: 'http://127.0.0.1:3010/callback',
      grant_type: 'authorization_code',
    });
    expect(harness.pages).toEqual(['Consent received. You may close this tab.']);
    expect(harness.closed).toEqual(['closed']);
  });

  it('[GGL-4] builds the consent URL as Google requires it: offline access, consent forced, every scope, the loopback redirect', async () => {
    const google = fakeGoogleFetch({
      [`POST ${TOKEN_ENDPOINT}`]: () => json({ refresh_token: 'rt', scope: 's' }),
    });
    let consent: URL | null = null;
    const harness = listening((url) => {
      consent = url;
      return `/callback?state=state-1&code=c`;
    });
    await authorize(options(google, harness));
    const url = consent as URL | null;
    expect(url?.origin && url.origin + url.pathname).toBe(AUTH_ENDPOINT);
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      client_id: 'client',
      redirect_uri: 'http://127.0.0.1:3010/callback',
      response_type: 'code',
      scope:
        'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
      access_type: 'offline',
      prompt: 'consent',
      state: 'state-1',
    });
  });

  it('[GGL-4] refuses a redirect with another state, one Google marked refused, and a grant with no refresh token', async () => {
    const google = fakeGoogleFetch({
      [`POST ${TOKEN_ENDPOINT}`]: () => json({ access_token: 'at' }),
    });
    await expect(
      authorize(
        options(
          google,
          listening(() => '/callback?state=other&code=c'),
        ),
      ),
    ).rejects.toThrow('the redirect carried another state');
    await expect(
      authorize(
        options(
          google,
          listening(() => '/callback?error=access_denied'),
        ),
      ),
    ).rejects.toThrow(ConsentFailed);
    await expect(
      authorize(
        options(
          google,
          listening(() => '/callback?state=state-1&code=c'),
        ),
      ),
    ).rejects.toThrow('Google gave no refresh token');
  });
});
