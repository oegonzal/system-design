import { functionUrlEvent, type EventShape } from '../testing';
import type { Refresh, SignIn, TokenVerdict } from './port';
import { createSession, sameOriginPath } from './session';

const ATTRIBUTES = 'HttpOnly; Secure; SameSite=Lax; Path=/';
const cleared = (name: string) => `${name}=; Max-Age=0; ${ATTRIBUTES}`;

/** A session over fakes: each token's verdict, what a sign-in comes to, what a refresh comes to. */
function session(options: {
  verdicts?: Record<string, TokenVerdict>;
  signIn?: SignIn;
  refresh?: Refresh;
}) {
  const signIns: [string, string][] = [];
  const refreshes: string[] = [];
  const layer = createSession({
    verifier: { verify: async (token) => options.verdicts?.[token] ?? 'invalid' },
    authenticator: {
      signIn: async (email, password) => {
        signIns.push([email, password]);
        return options.signIn ?? { kind: 'refused' };
      },
      refresh: async (token) => {
        refreshes.push(token);
        return options.refresh ?? { kind: 'refused' };
      },
    },
  });
  return { layer, signIns, refreshes };
}

const cookieValue = (cookies: readonly string[] | undefined, name: string): string | undefined =>
  cookies
    ?.find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(';')[0]
    .slice(name.length + 1);

const hiddenField = (html: string, name: string): string | undefined =>
  html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1];

/** A posted form, as the function URL carries one. */
const posted = (fields: Record<string, string>, shape: EventShape = {}) =>
  functionUrlEvent({
    method: 'POST',
    path: '/auth/login',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    ...shape,
  });

describe('the session layer', () => {
  it('owns the paths under /auth and nothing beside them', () => {
    const { layer } = session({});
    expect(layer.owns('/auth/login')).toBe(true);
    expect(layer.owns('/auth')).toBe(true);
    expect(layer.owns('/authentic')).toBe(false);
  });

  it('keeps a return-to address on this origin only, and never under /auth', () => {
    expect(sameOriginPath('/prompts/1?tab=brief')).toBe('/prompts/1?tab=brief');
    expect(sameOriginPath(undefined)).toBe('/');
    expect(sameOriginPath('https://evil.example/')).toBe('/');
    expect(sameOriginPath('//evil.example/')).toBe('/');
    expect(sameOriginPath('/\\evil.example/')).toBe('/');
    expect(sameOriginPath('/auth/login')).toBe('/');
    expect(sameOriginPath('/auth/logout?x=1')).toBe('/');
    expect(sameOriginPath('/authentic')).toBe('/authentic');
  });

  it('renders the sign-in form with its token in a cookie and the hidden field alike', async () => {
    const { layer } = session({});
    const result = await layer.route(
      functionUrlEvent({ path: '/auth/login', query: 'returnTo=%2Fprompts%2F1' }),
    );
    expect(result.statusCode).toBe(200);
    expect(result.headers).toEqual({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    const csrf = cookieValue(result.cookies, 'sd_csrf');
    expect(csrf).toMatch(/^[\w-]{20,}$/);
    expect(result.cookies).toEqual([`sd_csrf=${csrf}; Max-Age=600; ${ATTRIBUTES}`]);
    expect(hiddenField(result.body ?? '', 'csrf')).toBe(csrf);
    expect(hiddenField(result.body ?? '', 'returnTo')).toBe('/prompts/1');
    expect(result.body).toContain('<form method="post" action="/auth/login">');
    expect(result.body).toContain('type="password" name="password"');
  });

  it('signs in a form whose token matches: asks the pool, sets the session, clears the token, returns', async () => {
    const { layer, signIns } = session({
      signIn: { kind: 'grant', grant: { idToken: 'id-1', refreshToken: 'refresh-1' } },
    });
    const result = await layer.route(
      posted(
        {
          csrf: 'token-1',
          email: ' me@example.com ',
          password: 'pass word',
          returnTo: '/prompts/1',
        },
        { cookies: ['sd_csrf=token-1'] },
      ),
    );
    expect(signIns).toEqual([['me@example.com', 'pass word']]);
    expect(result.statusCode).toBe(302);
    expect(result.headers?.['location']).toBe('/prompts/1');
    expect(result.headers?.['cache-control']).toBe('no-store');
    expect(result.cookies).toEqual([
      `sd_id=id-1; Max-Age=2592000; ${ATTRIBUTES}`,
      `sd_refresh=refresh-1; Max-Age=2592000; ${ATTRIBUTES}`,
      cleared('sd_csrf'),
    ]);
  });

  it('reads a form the function URL carried base64-encoded, and returns an off-origin address to /', async () => {
    const { layer, signIns } = session({ signIn: { kind: 'grant', grant: { idToken: 'id-1' } } });
    const fields = new URLSearchParams({
      csrf: 't',
      email: 'me@example.com',
      password: 'p',
      returnTo: 'https://evil.example/',
    });
    const result = await layer.route(
      posted(
        {},
        {
          cookies: ['sd_csrf=t'],
          body: Buffer.from(fields.toString()).toString('base64'),
          isBase64Encoded: true,
        },
      ),
    );
    expect(signIns).toEqual([['me@example.com', 'p']]);
    expect(result.headers?.['location']).toBe('/');
    expect(result.cookies).toEqual([
      `sd_id=id-1; Max-Age=2592000; ${ATTRIBUTES}`,
      cleared('sd_csrf'),
    ]);
  });

  it('refuses a form whose token is not the cookie’s, asking the pool nothing, and renders the form again', async () => {
    const { layer, signIns } = session({ signIn: { kind: 'grant', grant: { idToken: 'id-1' } } });
    const mismatched = await layer.route(
      posted({ csrf: 'other', email: 'a@b.c', password: 'p' }, { cookies: ['sd_csrf=token-1'] }),
    );
    const noCookie = await layer.route(posted({ csrf: 'token-1', email: 'a@b.c', password: 'p' }));
    const noField = await layer.route(
      posted({ email: 'a@b.c', password: 'p' }, { cookies: ['sd_csrf=token-1'] }),
    );
    expect(signIns).toEqual([]);
    for (const result of [mismatched, noCookie, noField]) {
      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('The form had expired');
      expect(result.body).toContain('<form method="post"');
      expect(cookieValue(result.cookies, 'sd_csrf')).not.toBe('token-1');
    }
  });

  it('renders the form again with a message and 401 when the pool refuses the password', async () => {
    const { layer } = session({ signIn: { kind: 'refused' } });
    const result = await layer.route(
      posted(
        { csrf: 't', email: 'a@b.c', password: 'wrong', returnTo: '/prompts/1' },
        { cookies: ['sd_csrf=t'] },
      ),
    );
    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('were not accepted');
    expect(hiddenField(result.body ?? '', 'returnTo')).toBe('/prompts/1');
    expect(result.cookies?.map((cookie) => cookie.split('=')[0])).toEqual(['sd_csrf']);
  });

  it('asks for both fields before asking the pool', async () => {
    const { layer, signIns } = session({});
    const result = await layer.route(
      posted({ csrf: 't', email: 'a@b.c', password: '' }, { cookies: ['sd_csrf=t'] }),
    );
    expect(result.statusCode).toBe(400);
    expect(signIns).toEqual([]);
  });

  it('names the command that ends a NEW_PASSWORD_REQUIRED challenge, and names any other challenge', async () => {
    const newPassword = session({ signIn: { kind: 'challenge', name: 'NEW_PASSWORD_REQUIRED' } });
    const other = session({ signIn: { kind: 'challenge', name: 'SMS_MFA' } });
    const form = posted({ csrf: 't', email: 'a@b.c', password: 'p' }, { cookies: ['sd_csrf=t'] });
    const first = await newPassword.layer.route(form);
    const second = await other.layer.route(form);
    expect(first.statusCode).toBe(403);
    expect(first.body).toContain('aws cognito-idp admin-set-user-password --permanent');
    expect(first.headers?.['content-type']).toContain('text/html');
    expect(second.body).toContain('SMS_MFA');
  });

  it('logs out a request from this site, clearing every cookie, and refuses one from elsewhere', async () => {
    const { layer } = session({});
    const logout = (site?: string) =>
      layer.route(
        functionUrlEvent({
          path: '/auth/logout',
          headers: site === undefined ? {} : { 'sec-fetch-site': site },
        }),
      );
    for (const site of ['same-origin', 'none']) {
      const result = await logout(site);
      expect(result.statusCode).toBe(302);
      expect(result.headers?.['location']).toBe('/auth/login');
      expect(result.cookies).toEqual([cleared('sd_id'), cleared('sd_refresh'), cleared('sd_csrf')]);
    }
    for (const site of ['cross-site', 'same-site', undefined]) {
      const result = await logout(site);
      expect(result.statusCode).toBe(403);
      expect(result.cookies).toBeUndefined();
    }
  });

  it('answers 405 for a method its routes do not take, and 404 for a path under /auth it does not route', async () => {
    const { layer } = session({});
    const wrongMethod = await layer.route(
      functionUrlEvent({ method: 'POST', path: '/auth/logout' }),
    );
    const unknown = await layer.route(functionUrlEvent({ path: '/auth/other' }));
    expect(wrongMethod.statusCode).toBe(405);
    expect(unknown.statusCode).toBe(404);
  });

  it('lets a valid ID token through, setting nothing', async () => {
    const { layer } = session({ verdicts: { 'id-1': 'valid' } });
    const gate = await layer.gate(functionUrlEvent({ cookies: ['sd_id=id-1'] }), false);
    expect(gate).toEqual({ kind: 'proceed', cookies: [] });
  });

  it('sends a page without a session to login, remembering where it was going, clearing nothing', async () => {
    const { layer } = session({});
    const gate = await layer.gate(
      functionUrlEvent({ path: '/prompts/1', query: 'tab=brief', cookies: ['other=1'] }),
      false,
    );
    expect(gate.kind).toBe('respond');
    if (gate.kind !== 'respond') return;
    expect(gate.result.statusCode).toBe(302);
    expect(gate.result.headers?.['location']).toBe(
      '/auth/login?returnTo=%2Fprompts%2F1%3Ftab%3Dbrief',
    );
    expect(gate.result.cookies).toEqual([]);
  });

  it('answers an api route with a bad token in JSON, naming where to log in, and clears the session', async () => {
    const { layer, refreshes } = session({ verdicts: { 'id-bad': 'invalid' } });
    const gate = await layer.gate(
      functionUrlEvent({ path: '/api/prompts', cookies: ['sd_id=id-bad', 'sd_refresh=r'] }),
      true,
    );
    expect(refreshes).toEqual([]);
    expect(gate.kind).toBe('respond');
    if (gate.kind !== 'respond') return;
    expect(gate.result.statusCode).toBe(401);
    expect(JSON.parse(gate.result.body ?? '')).toEqual({
      error: 'unauthenticated',
      login: '/auth/login',
    });
    expect(gate.result.headers?.['cache-control']).toBe('no-store');
    expect(gate.result.cookies).toEqual([cleared('sd_id'), cleared('sd_refresh')]);
  });

  it('refreshes an expired ID token in place, and one the browser no longer carries', async () => {
    const { layer, refreshes } = session({
      verdicts: { 'id-old': 'expired', 'id-new': 'valid' },
      refresh: { kind: 'grant', grant: { idToken: 'id-new' } },
    });
    const expired = await layer.gate(
      functionUrlEvent({ cookies: ['sd_id=id-old', 'sd_refresh=refresh-1'] }),
      true,
    );
    const gone = await layer.gate(functionUrlEvent({ cookies: ['sd_refresh=refresh-1'] }), true);
    expect(refreshes).toEqual(['refresh-1', 'refresh-1']);
    const refreshed = {
      kind: 'proceed',
      cookies: [`sd_id=id-new; Max-Age=2592000; ${ATTRIBUTES}`],
    };
    expect(expired).toEqual(refreshed);
    expect(gone).toEqual(refreshed);
  });

  it('clears both session cookies on the answer when the refresh is refused — the 302 and the 401 alike', async () => {
    const { layer, refreshes } = session({ verdicts: { 'id-old': 'expired' } });
    const cookies = ['sd_id=id-old', 'sd_refresh=refresh-1'];
    const page = await layer.gate(functionUrlEvent({ path: '/prompts/1', cookies }), false);
    const api = await layer.gate(functionUrlEvent({ path: '/api/x', cookies }), true);
    expect(refreshes).toEqual(['refresh-1', 'refresh-1']);
    expect(page.kind === 'respond' && page.result).toMatchObject({
      statusCode: 302,
      cookies: [cleared('sd_id'), cleared('sd_refresh')],
    });
    expect(api.kind === 'respond' && api.result).toMatchObject({
      statusCode: 401,
      cookies: [cleared('sd_id'), cleared('sd_refresh')],
    });
  });
});
