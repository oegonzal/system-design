import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { GMAIL_ENV, gmailConfigFromEnv, GmailConfigError, PACKAGE_ROOT, PEER_URLS } from './config';
import { readSettings } from './settings';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });

const GOOGLE = { GOOGLE_OAUTH_CLIENT_ID: 'client', GOOGLE_OAUTH_CLIENT_SECRET: 'secret' };

describe('the service configuration', () => {
  const shipped = readSettings(PACKAGE_ROOT);

  it('[GML-2] declares every variable once with its default, binds each peer the settings name to its URL, and reads the environment nowhere else', () => {
    expect(gmailConfigFromEnv(shipped, GOOGLE)).toMatchObject({
      port: 3008,
      loopUrl: 'http://localhost:3003',
      notificationsUrl: 'http://localhost:3005',
      peerUrls: ['http://localhost:3009'],
      google: {
        clientId: 'client',
        tokenFile: 'static/google/oauth-token.json',
        refreshToken: null,
      },
    });
    expect(
      gmailConfigFromEnv(shipped, {
        ...GOOGLE,
        [GMAIL_ENV.port.name]: ' 3108 ',
        [PEER_URLS['google-calendar'].name]: 'http://calendar:1',
      }),
    ).toMatchObject({ port: 3108, peerUrls: ['http://calendar:1'] });
    expect(() => gmailConfigFromEnv(shipped, { ...GOOGLE, [GMAIL_ENV.port.name]: 'many' })).toThrow(
      new GmailConfigError('GMAIL_PORT must be a port number, got "many"'),
    );
    expect(() =>
      gmailConfigFromEnv(shipped, { ...GOOGLE, [GMAIL_ENV.loopUrl.name]: 'nope' }),
    ).toThrow(new GmailConfigError('QUALITY_LOOP_URL must be a URL, got "nope"'));
    expect(() => gmailConfigFromEnv(shipped, {})).toThrow(/GOOGLE_OAUTH_CLIENT_ID/);
    expect(() => gmailConfigFromEnv({ ...shipped, peers: { peers: ['nobody'] } }, GOOGLE)).toThrow(
      /config\/peers names "nobody", which no variable locates/,
    );

    const readers = sources(__dirname)
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['app/testing.ts', 'config.ts']);
    for (const variable of [...Object.values(GMAIL_ENV), ...Object.values(PEER_URLS)]) {
      expect(variable.name).toMatch(/^[A-Z_]+$/);
      expect(variable.fallback.length).toBeGreaterThan(0);
    }
  });
});
