import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EngineConfigError } from '@sysdesign/config-kit';

import { NotificationsConfigError, PACKAGE_ROOT } from './config';
import { readSettings } from './settings';

const CONFIG = join(PACKAGE_ROOT, 'config');
const real = (at: string): string => readFileSync(at, 'utf8');

/** The package's own files, with the choices file replaced — and any file named here replaced too. */
const choosing =
  (choices: Record<string, string>, files: Record<string, string> = {}) =>
  (at: string): string => {
    if (at === join(CONFIG, 'engine.json')) return JSON.stringify(choices);
    const named = Object.entries(files).find(([name]) => at === join(CONFIG, name));
    return named === undefined ? real(at) : named[1];
  };

const profiles = (kind: string): string[] =>
  readdirSync(join(CONFIG, kind))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length));

const STANDARD = { bus: 'standard', interactions: 'standard', channels: 'none' };

describe('the service settings', () => {
  it('[NTF-9] reads the choices the package ships, and every profile it ships validates with every other', () => {
    const settings = readSettings(PACKAGE_ROOT);
    expect(settings.sources.bus).toMatch(/config\/bus\/standard\.json$/);
    expect(settings.interactions.pullWaitMs).toBeLessThanOrEqual(settings.bus.maxWaitMs);
    for (const bus of profiles('bus')) {
      for (const interactions of profiles('interactions')) {
        for (const channels of profiles('channels')) {
          expect(() =>
            readSettings(PACKAGE_ROOT, choosing({ bus, interactions, channels })),
          ).not.toThrow();
        }
      }
    }
  });

  it('[NTF-9] refuses a kind left unchosen, a field no schema declares, and a subscriber asking past the bus', () => {
    expect(() =>
      readSettings(PACKAGE_ROOT, choosing({ bus: 'standard', interactions: 'standard' })),
    ).toThrow(/config\/engine\.json chooses no channels: name a file under .*config\/channels/);
    expect(() =>
      readSettings(
        PACKAGE_ROOT,
        choosing(STANDARD, { 'channels/none.json': '{"carrier-pigeon":{}}' }),
      ),
    ).toThrow(EngineConfigError);
    const standard = JSON.parse(real(join(CONFIG, 'interactions', 'standard.json'))) as Record<
      string,
      number
    >;
    expect(() =>
      readSettings(
        PACKAGE_ROOT,
        choosing(STANDARD, {
          'interactions/standard.json': JSON.stringify({ ...standard, pullWaitMs: 3_600_000 }),
        }),
      ),
    ).toThrow(NotificationsConfigError);
  });
});
