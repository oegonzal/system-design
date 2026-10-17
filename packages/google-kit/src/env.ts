/**
 * What a Google-backed program reads for its credentials, declared once:
 * the variable names and their fallbacks, the scopes each program needs, and
 * the one reader of an environment it is handed — a program's `config.ts`
 * passes `process.env` in, so the program still reads the environment in
 * one place of its own.
 */
export const GOOGLE_ENV = {
  /** The OAuth client of type "Desktop app", from the Google Cloud console. */
  clientId: { name: 'GOOGLE_OAUTH_CLIENT_ID' },
  clientSecret: { name: 'GOOGLE_OAUTH_CLIENT_SECRET' },
  /** Where the refresh token the consent obtained is kept; the owner alone can read it. */
  tokenFile: { name: 'GOOGLE_OAUTH_TOKEN_FILE', fallback: 'static/google/oauth-token.json' },
  /** The refresh token itself, for a process with no file to read — a pod; when set it wins over the file. */
  refreshToken: { name: 'GOOGLE_OAUTH_REFRESH_TOKEN' },
} as const;

/**
 * The scopes each program needs, as one table: a consent requests every entry
 * at once, so one consent serves every program, and each program refuses to
 * start on a grant that lacks its own.
 */
export const GOOGLE_SCOPES = {
  /** Search, read, drafts and labels; the mailbox service never sends. */
  gmail: ['https://www.googleapis.com/auth/gmail.modify'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
} as const;

/** Every scope any program needs, the set one consent requests. */
export const ALL_GOOGLE_SCOPES: readonly string[] = [
  ...new Set(Object.values(GOOGLE_SCOPES).flat()),
];

/** Where the loopback listener waits for the consent's redirect. */
export const AUTHORIZE_LOOPBACK_PORT = 3010;

export class GoogleConfigError extends Error {
  override readonly name = 'GoogleConfigError';
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  tokenFile: string;
  refreshToken: string | null;
}

const set = (env: Readonly<Record<string, string | undefined>>, name: string): string | null => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? null : value.trim();
};

/** The credentials from an environment: the client refused by name when unset, the token file at its fallback, the token itself optional. */
export function googleCredentialsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): GoogleCredentials {
  const clientId = set(env, GOOGLE_ENV.clientId.name);
  const clientSecret = set(env, GOOGLE_ENV.clientSecret.name);
  if (clientId === null || clientSecret === null) {
    throw new GoogleConfigError(
      `${GOOGLE_ENV.clientId.name} and ${GOOGLE_ENV.clientSecret.name} must be set: the OAuth client of type "Desktop app" from the Google Cloud console`,
    );
  }
  return {
    clientId,
    clientSecret,
    tokenFile: set(env, GOOGLE_ENV.tokenFile.name) ?? GOOGLE_ENV.tokenFile.fallback,
    refreshToken: set(env, GOOGLE_ENV.refreshToken.name),
  };
}
