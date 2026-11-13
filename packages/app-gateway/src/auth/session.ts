import {
  header,
  htmlResult,
  jsonResult,
  messagePage,
  methodOf,
  NO_STORE,
  pathWithQuery,
  readCookies,
  readForm,
  redirectResult,
  type GatewayEvent,
  type GatewayResult,
} from '../http';
import { AUTH_PREFIX, prefixCovers } from '../routes';
import { clearCookie, COOKIE_MAX_AGE, csrfToken, SESSION_COOKIES, setCookie } from './cookies';
import { loginPage } from './login-page';
import type { Authenticator, SessionGrant, TokenVerifier } from './port';

/**
 * The session layer: a Cognito sign-in enforced at the edge, so every UI and
 * API behind the gateway is covered with no code of its own.
 *
 * The gateway owns `/auth/*`. `GET /auth/login` renders the sign-in form and
 * sets its token in a cookie; `POST /auth/login` takes the form back, holds
 * the token in the field to the one in the cookie — a form another site
 * posted carries neither — and asks the pool for tokens; `GET /auth/logout`
 * clears the session when the request comes from this site. Every other
 * request is gated: a valid ID token goes through; an expired one with a
 * refresh token is refreshed in place; anything else is sent to login — as a
 * 302 for a page, as 401 JSON for an API route, whose caller is a script and
 * not a person — with a session that failed cleared from the browser.
 */
const LOGIN_PATH = `${AUTH_PREFIX}/login`;
const LOGOUT_PATH = `${AUTH_PREFIX}/logout`;

/** Where the session cookies are held by the viewer's own navigation, not a page elsewhere. */
const SAME_SITE_FETCH = new Set(['same-origin', 'none']);

interface SessionDeps {
  verifier: TokenVerifier;
  authenticator: Authenticator;
}

/** What the gate decided: let the request through, setting these cookies on the answer, or answer for it. */
export type Gate =
  { kind: 'proceed'; cookies: readonly string[] } | { kind: 'respond'; result: GatewayResult };

export interface Session {
  /** Whether the gateway itself answers this path. */
  owns(path: string): boolean;
  /** The gateway's own routes under `/auth`. */
  route(event: GatewayEvent): Promise<GatewayResult>;
  /** Every other request; `api` routes are answered in JSON. */
  gate(event: GatewayEvent, api: boolean): Promise<Gate>;
}

/**
 * A path on this origin, or `/`: anything that resolves to another origin is
 * refused, and so is a path the gateway itself owns — returning to the login
 * page would loop.
 */
export function sameOriginPath(candidate: string | null | undefined): string {
  if (candidate === null || candidate === undefined || !candidate.startsWith('/')) return '/';
  const origin = 'https://gateway.invalid';
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin || prefixCovers(AUTH_PREFIX, url.pathname)) return '/';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}

const sessionCookies = (grant: SessionGrant): string[] => [
  setCookie(SESSION_COOKIES.id, grant.idToken, COOKIE_MAX_AGE.id),
  ...(grant.refreshToken === undefined
    ? []
    : [setCookie(SESSION_COOKIES.refresh, grant.refreshToken, COOKIE_MAX_AGE.refresh)]),
];

const clearedSession = (): string[] => [
  clearCookie(SESSION_COOKIES.id),
  clearCookie(SESSION_COOKIES.refresh),
];

/** The form, with a fresh token in the cookie and the field: every render starts a new attempt. */
function loginForm(returnTo: string, status: number, message?: string): GatewayResult {
  const csrf = csrfToken();
  return {
    ...htmlResult(status, loginPage({ returnTo, csrf, message }), NO_STORE),
    cookies: [setCookie(SESSION_COOKIES.csrf, csrf, COOKIE_MAX_AGE.csrf)],
  };
}

const CHALLENGE_MESSAGES: Readonly<Record<string, string>> = {
  NEW_PASSWORD_REQUIRED:
    'This account still has its temporary password. Set a permanent one with ' +
    '`aws cognito-idp admin-set-user-password --permanent`, then sign in again.',
};

function challengePage(name: string): GatewayResult {
  const message =
    CHALLENGE_MESSAGES[name] ??
    `The account needs a step this page does not offer (${name}); complete it in the user pool, then sign in again.`;
  return htmlResult(403, messagePage('Sign-in needs another step', message), NO_STORE);
}

async function submitLogin(
  event: GatewayEvent,
  authenticator: Authenticator,
): Promise<GatewayResult> {
  const form = readForm(event);
  const returnTo = sameOriginPath(form.get('returnTo'));
  const csrf = form.get('csrf');
  if (csrf === null || csrf === '' || csrf !== readCookies(event)[SESSION_COOKIES.csrf]) {
    return loginForm(returnTo, 403, 'The form had expired; sign in again.');
  }
  const email = form.get('email')?.trim() ?? '';
  const password = form.get('password') ?? '';
  if (email === '' || password === '') {
    return loginForm(returnTo, 400, 'Both the email and the password are needed.');
  }
  const signIn = await authenticator.signIn(email, password);
  switch (signIn.kind) {
    case 'grant':
      return redirectResult(returnTo, [
        ...sessionCookies(signIn.grant),
        clearCookie(SESSION_COOKIES.csrf),
      ]);
    case 'refused':
      return loginForm(returnTo, 401, 'That email and password were not accepted.');
    case 'challenge':
      return challengePage(signIn.name);
  }
}

function logout(event: GatewayEvent): GatewayResult {
  if (!SAME_SITE_FETCH.has(header(event, 'sec-fetch-site') ?? '')) {
    return jsonResult(403, { error: 'logout is answered to this site alone' }, NO_STORE);
  }
  return redirectResult(LOGIN_PATH, [...clearedSession(), clearCookie(SESSION_COOKIES.csrf)]);
}

const unauthenticated = (event: GatewayEvent, api: boolean, cookies: string[]): Gate => ({
  kind: 'respond',
  result: {
    ...(api
      ? jsonResult(401, { error: 'unauthenticated', login: LOGIN_PATH }, NO_STORE)
      : redirectResult(`${LOGIN_PATH}?returnTo=${encodeURIComponent(pathWithQuery(event))}`)),
    cookies,
  },
});

export function createSession({ verifier, authenticator }: SessionDeps): Session {
  return {
    owns: (path) => prefixCovers(AUTH_PREFIX, path),

    async route(event) {
      const method = methodOf(event);
      switch (`${method} ${event.rawPath}`) {
        case `GET ${LOGIN_PATH}`:
          return loginForm(
            sameOriginPath(new URLSearchParams(event.rawQueryString).get('returnTo')),
            200,
          );
        case `POST ${LOGIN_PATH}`:
          return submitLogin(event, authenticator);
        case `GET ${LOGOUT_PATH}`:
          return logout(event);
        default:
          return event.rawPath === LOGIN_PATH || event.rawPath === LOGOUT_PATH
            ? jsonResult(405, { error: 'method not allowed' }, NO_STORE)
            : jsonResult(404, { error: 'not found' }, NO_STORE);
      }
    },

    async gate(event, api) {
      const cookies = readCookies(event);
      const idToken = cookies[SESSION_COOKIES.id];
      const refreshToken = cookies[SESSION_COOKIES.refresh];
      if (idToken === undefined && refreshToken === undefined) {
        return unauthenticated(event, api, []);
      }
      const verdict = idToken === undefined ? 'expired' : await verifier.verify(idToken);
      if (verdict === 'valid') return { kind: 'proceed', cookies: [] };
      if (verdict === 'expired' && refreshToken !== undefined) {
        const refresh = await authenticator.refresh(refreshToken);
        if (
          refresh.kind === 'grant' &&
          (await verifier.verify(refresh.grant.idToken)) === 'valid'
        ) {
          return { kind: 'proceed', cookies: sessionCookies(refresh.grant) };
        }
      }
      return unauthenticated(event, api, clearedSession());
    },
  };
}
