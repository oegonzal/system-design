import { resolve } from 'node:path';

import { googleCredentialsFromEnv, type GoogleCredentials } from '@sysdesign/google-kit';

import type { GmailSettings } from './settings';

/**
 * The service's configuration, declared once. Every variable it reads is named
 * here with its fallback and read by the one function below, which refuses by
 * name anything it cannot use; the Google credentials are read by the kit's
 * own reader from the environment handed in. Everything else is a file under
 * the package's own `config/`, read by `settings.ts`; `config.spec.ts` holds
 * the package to reading the environment only here.
 */

/** The package itself — `dist/..` as built, `src/..` under test — whose `config/` holds the settings. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Every variable the service reads of its own, with the value it takes when unset. */
export const GMAIL_ENV = {
  port: { name: 'GMAIL_PORT', fallback: '3008' },
  /** The quality loop every session's plans come from. */
  loopUrl: { name: 'QUALITY_LOOP_URL', fallback: 'http://localhost:3003' },
  /** The bus the service publishes to and asks the operator through. */
  notificationsUrl: { name: 'NOTIFICATIONS_URL', fallback: 'http://localhost:3005' },
} as const;

/** Where each peer the settings may name serves its tools; a peer named with no binding here is refused by name. */
export const PEER_URLS = {
  'google-calendar': { name: 'GOOGLE_CALENDAR_URL', fallback: 'http://localhost:3009' },
} as const;

export class GmailConfigError extends Error {
  override readonly name = 'GmailConfigError';
}

/** What the application is composed from. */
export interface GmailConfig {
  port: number;
  loopUrl: string;
  notificationsUrl: string;
  /** The peers the settings mount, each at the URL its variable gives. */
  peerUrls: string[];
  google: GoogleCredentials;
  settings: GmailSettings;
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

const url = (env: NodeJS.ProcessEnv, variable: { name: string; fallback: string }): string => {
  const value = set(env, variable.name) ?? variable.fallback;
  try {
    new URL(value);
  } catch {
    throw new GmailConfigError(`${variable.name} must be a URL, got ${JSON.stringify(value)}`);
  }
  return value;
};

const peerUrl = (env: NodeJS.ProcessEnv, peer: string): string => {
  if (!Object.hasOwn(PEER_URLS, peer)) {
    throw new GmailConfigError(
      `config/peers names ${JSON.stringify(peer)}, which no variable locates; the peers known are ${Object.keys(PEER_URLS).join(', ')}`,
    );
  }
  return url(env, PEER_URLS[peer as keyof typeof PEER_URLS]);
};

/** The one read of the environment: a bad port, URL or peer is refused by name before anything boots. */
export function gmailConfigFromEnv(
  settings: GmailSettings,
  env: NodeJS.ProcessEnv = process.env,
): GmailConfig {
  const port = set(env, GMAIL_ENV.port.name) ?? GMAIL_ENV.port.fallback;
  if (!/^\d{1,5}$/.test(port) || Number(port) === 0 || Number(port) > 65_535) {
    throw new GmailConfigError(
      `${GMAIL_ENV.port.name} must be a port number, got ${JSON.stringify(port)}`,
    );
  }
  return {
    port: Number(port),
    loopUrl: url(env, GMAIL_ENV.loopUrl),
    notificationsUrl: url(env, GMAIL_ENV.notificationsUrl),
    peerUrls: settings.peers.peers.map((peer) => peerUrl(env, peer)),
    google: googleCredentialsFromEnv(env),
    settings,
  };
}
