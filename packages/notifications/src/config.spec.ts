import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { ChannelDefinition } from './channels/port';
import {
  NOTIFICATIONS_ENV,
  notificationsConfigFromEnv,
  NotificationsConfigError,
  PACKAGE_ROOT,
} from './config';
import { readSettings } from './settings';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });

/** A channel declared the way every channel is, for the spec alone. */
const PAGER: ChannelDefinition = {
  id: 'pager',
  settings: z.strictObject({}),
  env: {
    token: { name: 'PAGER_TOKEN', required: true },
    room: { name: 'PAGER_ROOM', required: false },
  },
  create: () => {
    throw new Error('never built here');
  },
};

const shipped = readSettings(PACKAGE_ROOT);
const running = (channels: Record<string, unknown>) => ({ ...shipped, channels });

describe('the service configuration', () => {
  it('[NTF-9] declares its variables once with their fallbacks, and reads them nowhere else', () => {
    expect(notificationsConfigFromEnv(shipped, [], {}).port).toBe(3005);
    expect(
      notificationsConfigFromEnv(shipped, [], { [NOTIFICATIONS_ENV.port.name]: ' 4105 ' }).port,
    ).toBe(4105);
    expect(() => notificationsConfigFromEnv(shipped, [], { NOTIFICATIONS_PORT: 'eighty' })).toThrow(
      new NotificationsConfigError('NOTIFICATIONS_PORT must be a port number, got "eighty"'),
    );

    const readers = sources(__dirname)
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
  });

  it('[NTF-9] reads the variables of the channels it runs, by the keys their definitions declare, and refuses a missing one by name', () => {
    const env = { PAGER_TOKEN: 'abc', PAGER_ROOM: '' };
    expect(notificationsConfigFromEnv(running({ pager: {} }), [PAGER], env).channelEnv).toEqual({
      pager: { token: 'abc', room: undefined },
    });
    // A channel the settings do not run reads nothing, and needs nothing.
    expect(notificationsConfigFromEnv(running({}), [PAGER], {}).channelEnv).toEqual({});
    expect(() => notificationsConfigFromEnv(running({ pager: {} }), [PAGER], {})).toThrow(
      /runs pager, which needs PAGER_TOKEN: set it, or choose channels "none"$/,
    );
  });
});
