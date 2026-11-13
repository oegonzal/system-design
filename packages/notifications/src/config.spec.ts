import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { EngineConfigError } from '@sysdesign/config-kit';
import { z } from 'zod';

import type { ChannelSettings } from './channels';
import type { ChannelDefinition } from './channels/port';
import {
  NOTIFICATIONS_ENV,
  notificationsConfigFromEnv,
  NotificationsConfigError,
  PACKAGE_ROOT,
} from './config';
import { readSettings, type SettingsChoices } from './settings';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });

/** A channel kind declared the way every kind is, for the spec alone. */
const PAGER: ChannelDefinition = {
  id: 'pager',
  settings: z.strictObject({}),
  env: {
    token: { required: true, distinct: true },
    room: { required: false, distinct: false },
  },
  create: () => {
    throw new Error('never built here');
  },
};

/** The package's own files, read as the service reads them, with whatever the environment chose. */
const packaged = (choices: SettingsChoices) => readSettings(PACKAGE_ROOT, undefined, choices);
const shipped = packaged({});
const running = (channels: ChannelSettings) => (): typeof shipped => ({ ...shipped, channels });
/** Pager instances by id, each binding its own token and room. */
const pagers = (instances: Record<string, { token: string; room: string }>) =>
  running({
    pager: {
      settings: {},
      instances: Object.fromEntries(
        Object.entries(instances).map(([id, env]) => [id, { carries: ['spec'], env }]),
      ),
    },
  });

describe('the service configuration', () => {
  it('[NTF-9] declares its variables once with their fallbacks, and reads them nowhere else', () => {
    expect(notificationsConfigFromEnv(packaged, [], {}).port).toBe(3005);
    expect(
      notificationsConfigFromEnv(packaged, [], { [NOTIFICATIONS_ENV.port.name]: ' 4105 ' }).port,
    ).toBe(4105);
    expect(() =>
      notificationsConfigFromEnv(packaged, [], { NOTIFICATIONS_PORT: 'eighty' }),
    ).toThrow(
      new NotificationsConfigError('NOTIFICATIONS_PORT must be a port number, got "eighty"'),
    );

    const readers = sources(__dirname)
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
  });

  it('[NTF-9] runs the channels file the environment names, else the one the engine file chooses, and refuses a name with no file behind it', () => {
    const engineChoice = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'config', 'engine.json'), 'utf8'),
    ) as Record<string, string>;
    expect(notificationsConfigFromEnv(packaged, [], {}).settings.sources.channels).toMatch(
      new RegExp(`config/channels/${engineChoice['channels']}\\.json$`),
    );
    const named = notificationsConfigFromEnv(packaged, [], {
      [NOTIFICATIONS_ENV.channels.name]: ' telegram-cloud ',
    });
    expect(named.settings.sources.channels).toMatch(/config\/channels\/telegram-cloud\.json$/);
    expect(Object.keys(named.settings.channels['telegram']?.instances ?? {})).toEqual([
      'telegram.govcon',
      'telegram.job-application',
    ]);
    // An empty value is no choice, like an unset one.
    expect(
      notificationsConfigFromEnv(packaged, [], { NOTIFICATIONS_CHANNELS: '' }).settings.sources
        .channels,
    ).toBe(shipped.sources.channels);
    expect(() =>
      notificationsConfigFromEnv(packaged, [], { NOTIFICATIONS_CHANNELS: 'carrier-pigeon' }),
    ).toThrow(EngineConfigError);
    expect(() =>
      notificationsConfigFromEnv(packaged, [], { NOTIFICATIONS_CHANNELS: 'carrier-pigeon' }),
    ).toThrow(
      /chooses channels "carrier-pigeon", but config\/channels\/carrier-pigeon\.json does not exist/,
    );
  });

  it('[NTF-9] reads the variables each instance binds, under the keys its kind declares, and refuses a missing one by name', () => {
    const desk = pagers({ 'pager.desk': { token: 'DESK_TOKEN', room: 'DESK_ROOM' } });
    const env = { DESK_TOKEN: 'abc', DESK_ROOM: '' };
    expect(notificationsConfigFromEnv(desk, [PAGER], env).channelEnv).toEqual({
      'pager.desk': { token: 'abc', room: undefined },
    });
    // A kind the settings do not run reads nothing, and needs nothing.
    expect(notificationsConfigFromEnv(running({}), [PAGER], {}).channelEnv).toEqual({});
    expect(() => notificationsConfigFromEnv(desk, [PAGER], {})).toThrow(
      /runs pager\.desk, which needs DESK_TOKEN: set it, or choose channels "none"$/,
    );
  });

  it('[NTF-12] refuses two instances reading one value their kind holds distinct, naming their variables and never the value', () => {
    const two = pagers({
      'pager.desk': { token: 'DESK_TOKEN', room: 'ROOM' },
      'pager.field': { token: 'FIELD_TOKEN', room: 'ROOM' },
    });
    // One room behind both is no conflict; one token behind both is.
    const apart = { DESK_TOKEN: 'one', FIELD_TOKEN: 'two', ROOM: 'r' };
    expect(Object.keys(notificationsConfigFromEnv(two, [PAGER], apart).channelEnv)).toEqual([
      'pager.desk',
      'pager.field',
    ]);
    const shared = () =>
      notificationsConfigFromEnv(two, [PAGER], { DESK_TOKEN: 'secret-1', FIELD_TOKEN: 'secret-1' });
    expect(shared).toThrow(NotificationsConfigError);
    expect(shared).toThrow(
      /: pager\.desk and pager\.field read one pager token, through DESK_TOKEN and FIELD_TOKEN; each needs its own$/,
    );
    expect(shared).not.toThrow(/secret-1/);
  });
});
