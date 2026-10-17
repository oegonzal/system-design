import { z } from 'zod';

import { ALL_GOOGLE_SCOPES, type GoogleCredentials } from './env';
import { readTokenFile, type StoredToken, type TokenFileSystem } from './token-file';

export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** How a person obtains a grant: named in every refusal that needs one. */
export const AUTHORIZE_COMMAND = 'authorize';

/** How long before an access token expires it is minted again, so a request never carries one about to lapse. */
const RENEW_BEFORE_MS = 60_000;

/** The grant Google revoked, or never gave: `invalid_grant` from the token endpoint. */
export class GoogleAuthRevoked extends Error {
  override readonly name = 'GoogleAuthRevoked';
  constructor(detail: string) {
    super(
      `Google no longer honours the refresh token (${detail}): run \`${AUTHORIZE_COMMAND}\` again`,
    );
  }
}

/** The token endpoint answered something other than a token. */
export class GoogleAuthFailed extends Error {
  override readonly name = 'GoogleAuthFailed';
  constructor(detail: string) {
    super(`Google did not mint an access token: ${detail}`);
  }
}

/** A grant that lacks a scope the program needs. */
export class GoogleScopeMissing extends Error {
  override readonly name = 'GoogleScopeMissing';
  constructor(
    readonly program: string,
    readonly scope: string,
  ) {
    super(
      `the grant lacks ${scope}, which ${program} needs: run \`${AUTHORIZE_COMMAND}\` to consent to every scope`,
    );
  }
}

/** No grant at all: neither the token file nor the variable holds one. */
export class GoogleTokenMissing extends Error {
  override readonly name = 'GoogleTokenMissing';
  constructor(
    readonly tokenFile: string,
    readonly variable: string,
  ) {
    super(
      `no refresh token: ${tokenFile} does not exist and ${variable} is unset — run \`${AUTHORIZE_COMMAND}\` first`,
    );
  }
}

/** The grant a program runs on: the client, the refresh token, and what it may reach. */
export interface Grant {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: readonly string[];
}

/**
 * The grant from the credentials: the variable's token when set — a pod's
 * form, taken to cover every scope since the variable says nothing of them —
 * else the token file's, refused by name when there is neither.
 */
export function loadGrant(
  credentials: GoogleCredentials,
  variable: string,
  fs?: TokenFileSystem,
): Grant {
  const { clientId, clientSecret } = credentials;
  if (credentials.refreshToken !== null) {
    return {
      clientId,
      clientSecret,
      refreshToken: credentials.refreshToken,
      scopes: ALL_GOOGLE_SCOPES,
    };
  }
  const stored: StoredToken | null = readTokenFile(credentials.tokenFile, fs);
  if (stored === null) throw new GoogleTokenMissing(credentials.tokenFile, variable);
  return { clientId, clientSecret, refreshToken: stored.refreshToken, scopes: stored.scopes };
}

/** What a request needs of the auth: a token to carry, and a way to say the service refused it. */
export interface TokenSource {
  accessToken(): Promise<string>;
  /** The token the service refused is forgotten; the next request mints another. */
  invalidate(): void;
}

const mintedSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const refusalSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/**
 * Access tokens from a refresh token: minted at the token endpoint, kept
 * until a minute before they expire, minted again after that or after a
 * service refused one. A revoked grant names the command that obtains a new
 * one; a program whose scopes the grant lacks refuses to start.
 */
export class GoogleAuth implements TokenSource {
  private minted: { token: string; expiresAt: number } | null = null;
  private minting: Promise<string> | null = null;

  constructor(
    private readonly grant: Grant,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Refuses, naming the scope and the command, when the grant lacks one the program needs. */
  assertScopes(required: readonly string[], program: string): void {
    for (const scope of required) {
      if (!this.grant.scopes.includes(scope)) throw new GoogleScopeMissing(program, scope);
    }
  }

  async accessToken(): Promise<string> {
    if (this.minted !== null && this.minted.expiresAt - RENEW_BEFORE_MS > this.now()) {
      return this.minted.token;
    }
    this.minting ??= this.mint().finally(() => {
      this.minting = null;
    });
    return this.minting;
  }

  invalidate(): void {
    this.minted = null;
  }

  private async mint(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.grant.clientId,
      client_secret: this.grant.clientSecret,
      refresh_token: this.grant.refreshToken,
      grant_type: 'refresh_token',
    });
    let response: Response;
    try {
      response = await this.fetchImpl(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new GoogleAuthFailed(
        `the token endpoint could not be reached (${(error as Error).message})`,
      );
    }
    const answer: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const token = mintedSchema.safeParse(answer);
      if (!token.success)
        throw new GoogleAuthFailed('the token endpoint answered something other than a token');
      this.minted = {
        token: token.data.access_token,
        expiresAt: this.now() + token.data.expires_in * 1_000,
      };
      return this.minted.token;
    }
    const refusal = refusalSchema.safeParse(answer);
    const detail = refusal.success
      ? `${refusal.data.error}${refusal.data.error_description === undefined ? '' : `: ${refusal.data.error_description}`}`
      : `HTTP ${response.status}`;
    if (refusal.success && refusal.data.error === 'invalid_grant')
      throw new GoogleAuthRevoked(detail);
    throw new GoogleAuthFailed(detail);
  }
}
