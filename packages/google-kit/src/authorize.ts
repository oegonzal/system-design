import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { z } from 'zod';

import { AUTHORIZE_LOOPBACK_PORT } from './env';
import { TOKEN_ENDPOINT } from './oauth';
import type { StoredToken } from './token-file';

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALLBACK_PATH = '/callback';

/** A consent that did not end in a grant: the person refused, the state did not match, or Google gave no refresh token. */
export class ConsentFailed extends Error {
  override readonly name = 'ConsentFailed';
}

/** The one request the loopback listener waits for, as the handler reads it. */
export interface CallbackRequest {
  url: string;
}

/** A listener on the loopback address: answers the one redirect, then closes. A spec hands in its own. */
export type Listen = (
  port: number,
  handle: (request: CallbackRequest) => string,
) => Promise<{ close(): Promise<void> }>;

/**
 * The loopback listener over node:http. A browser keeps its connection open
 * after the page it was answered with, and a server's close waits for every
 * open connection: the page asks the browser to close it, and closing drops
 * whatever connection is still open, so the grant is answered the moment the
 * code is exchanged rather than when the browser lets go.
 */
const nodeListen: Listen = (port, handle) =>
  new Promise((resolve, reject) => {
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const page = handle({ url: request.url ?? '/' });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' });
      response.end(page);
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        close: () =>
          new Promise((done, failed) => {
            server.close((error) => (error ? failed(error) : done()));
            server.closeAllConnections();
          }),
      });
    });
  });

export interface AuthorizeOptions {
  clientId: string;
  clientSecret: string;
  scopes: readonly string[];
  /** Where the loopback listener waits; the declared port unless a program says otherwise. */
  port?: number;
  /** Where the consent URL is shown to the person who must open it. */
  announce(url: string): void;
  fetchImpl?: typeof fetch;
  listen?: Listen;
  now?: () => Date;
  /** The state token; a spec passes one it knows. */
  state?: string;
}

const grantedSchema = z.object({
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

/**
 * Consent, once, for every scope the table declares: a loopback listener on
 * the declared port, the consent URL announced, the state checked on the way
 * back, the code exchanged for a refresh token. `prompt=consent` makes Google
 * return a refresh token even to a client it has consented to before; a
 * consent that yields none is refused rather than stored.
 */
export async function authorize(options: AuthorizeOptions): Promise<StoredToken> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const listen = options.listen ?? nodeListen;
  const now = options.now ?? (() => new Date());
  const state = options.state ?? randomBytes(16).toString('hex');
  const port = options.port ?? AUTHORIZE_LOOPBACK_PORT;
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  let settle: (code: string) => void = () => undefined;
  let refuse: (error: Error) => void = () => undefined;
  const code = new Promise<string>((resolve, reject) => {
    settle = resolve;
    refuse = reject;
  });
  const listener = await listen(port, (request) => {
    const url = new URL(request.url, redirectUri);
    if (url.pathname !== CALLBACK_PATH) return 'Not the consent redirect.';
    const error = url.searchParams.get('error');
    if (error !== null) {
      refuse(new ConsentFailed(`Google answered ${error}`));
      return `Consent was not given (${error}). You may close this tab.`;
    }
    if (url.searchParams.get('state') !== state) {
      refuse(new ConsentFailed('the redirect carried another state'));
      return 'This redirect was not expected. You may close this tab.';
    }
    const granted = url.searchParams.get('code');
    if (granted === null) {
      refuse(new ConsentFailed('the redirect carried no code'));
      return 'The redirect carried no code. You may close this tab.';
    }
    settle(granted);
    return 'Consent received. You may close this tab.';
  });
  try {
    const consent = new URL(AUTH_ENDPOINT);
    consent.search = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: options.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString();
    options.announce(consent.toString());
    const granted = await code;
    return await exchange(granted, redirectUri, options, fetchImpl, now());
  } finally {
    await listener.close();
  }
}

/** The code for the grant, at the token endpoint. */
async function exchange(
  code: string,
  redirectUri: string,
  options: AuthorizeOptions,
  fetchImpl: typeof fetch,
  obtainedAt: Date,
): Promise<StoredToken> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ConsentFailed(
      `the token endpoint answered ${response.status}: ${JSON.stringify(answer)}`,
    );
  }
  const granted = grantedSchema.safeParse(answer);
  if (!granted.success || granted.data.refresh_token === undefined) {
    throw new ConsentFailed(
      'Google gave no refresh token; revoke the app at myaccount.google.com and consent again',
    );
  }
  return {
    refreshToken: granted.data.refresh_token,
    scopes: (granted.data.scope ?? options.scopes.join(' '))
      .split(' ')
      .filter((scope) => scope !== ''),
    clientId: options.clientId,
    obtainedAt: obtainedAt.toISOString(),
  };
}
