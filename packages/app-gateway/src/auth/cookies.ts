import { randomBytes } from 'node:crypto';

/**
 * The session's cookies: the ID token, the refresh token, and the sign-in
 * form's token. All HttpOnly, Secure, SameSite=Lax and site-wide, so a
 * same-origin fetch from any UI carries the session and no script reads it.
 * The proxy keeps all three from the upstream.
 */
export const SESSION_COOKIES = { id: 'sd_id', refresh: 'sd_refresh', csrf: 'sd_csrf' } as const;

export const SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set(Object.values(SESSION_COOKIES));

/**
 * How long each is kept, in seconds. The tokens stay as long as a refresh
 * token lives — the verifier, not the browser, decides when an ID token is
 * stale — and a sign-in form has ten minutes to be submitted.
 */
export const COOKIE_MAX_AGE = {
  id: 30 * 24 * 3600,
  refresh: 30 * 24 * 3600,
  csrf: 600,
} as const;

const ATTRIBUTES = 'HttpOnly; Secure; SameSite=Lax; Path=/';

export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; ${ATTRIBUTES}`;
}

export function clearCookie(name: string): string {
  return `${name}=; Max-Age=0; ${ATTRIBUTES}`;
}

/** The form's token: the double-submit value the cookie and the hidden field must both carry. */
export const csrfToken = (): string => randomBytes(16).toString('base64url');
