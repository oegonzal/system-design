import {
  ALL_GOOGLE_SCOPES,
  GOOGLE_ENV,
  GOOGLE_SCOPES,
  GoogleConfigError,
  googleCredentialsFromEnv,
} from './env';

describe('the credentials a Google-backed program reads', () => {
  it('[GGL-1] are named once, read from the environment handed in, and refused by name when the client is unset', () => {
    for (const variable of Object.values(GOOGLE_ENV))
      expect(variable.name).toMatch(/^GOOGLE_OAUTH_[A-Z_]+$/);
    expect(
      googleCredentialsFromEnv({
        GOOGLE_OAUTH_CLIENT_ID: ' id ',
        GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      }),
    ).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      tokenFile: 'static/google/oauth-token.json',
      refreshToken: null,
    });
    expect(
      googleCredentialsFromEnv({
        GOOGLE_OAUTH_CLIENT_ID: 'id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
        GOOGLE_OAUTH_TOKEN_FILE: '/tmp/t.json',
        GOOGLE_OAUTH_REFRESH_TOKEN: 'rt',
      }),
    ).toMatchObject({ tokenFile: '/tmp/t.json', refreshToken: 'rt' });
    expect(() => googleCredentialsFromEnv({ GOOGLE_OAUTH_CLIENT_ID: 'id' })).toThrow(
      GoogleConfigError,
    );
    expect(() => googleCredentialsFromEnv({ GOOGLE_OAUTH_CLIENT_SECRET: ' ' })).toThrow(
      'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set',
    );
  });

  it('[GGL-1] declares the scopes each program needs as one table that one consent requests whole', () => {
    expect(GOOGLE_SCOPES.gmail).toEqual(['https://www.googleapis.com/auth/gmail.modify']);
    expect(GOOGLE_SCOPES.calendar).toEqual(['https://www.googleapis.com/auth/calendar']);
    expect(ALL_GOOGLE_SCOPES).toEqual([...GOOGLE_SCOPES.gmail, ...GOOGLE_SCOPES.calendar]);
    for (const scope of ALL_GOOGLE_SCOPES)
      expect(scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
  });
});
