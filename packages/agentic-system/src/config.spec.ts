import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  AGENTIC_SYSTEM_ENV,
  agenticSystemConfigFromEnv,
  AgenticSystemConfigError,
  PACKAGE_ROOT,
} from './config';
import { readSettings } from './settings';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });

describe('the service configuration', () => {
  const shipped = readSettings(PACKAGE_ROOT);

  it('[AGS-5] declares every variable once with its default and reads them nowhere else', () => {
    expect(agenticSystemConfigFromEnv(shipped, {})).toMatchObject({
      port: 3007,
      loopUrl: 'http://localhost:3003',
      notificationsUrl: 'http://localhost:3005',
    });
    expect(
      agenticSystemConfigFromEnv(shipped, {
        [AGENTIC_SYSTEM_ENV.port.name]: ' 3107 ',
        [AGENTIC_SYSTEM_ENV.loopUrl.name]: 'http://loop:1',
      }),
    ).toMatchObject({ port: 3107, loopUrl: 'http://loop:1' });
    expect(() =>
      agenticSystemConfigFromEnv(shipped, { [AGENTIC_SYSTEM_ENV.port.name]: 'many' }),
    ).toThrow(
      new AgenticSystemConfigError('AGENTIC_SYSTEM_PORT must be a port number, got "many"'),
    );
    expect(() =>
      agenticSystemConfigFromEnv(shipped, { [AGENTIC_SYSTEM_ENV.notificationsUrl.name]: 'nope' }),
    ).toThrow(new AgenticSystemConfigError('NOTIFICATIONS_URL must be a URL, got "nope"'));

    const readers = sources(__dirname)
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
    for (const variable of Object.values(AGENTIC_SYSTEM_ENV)) {
      expect(variable.name).toMatch(/^[A-Z_]+$/);
      expect(variable.fallback.length).toBeGreaterThan(0);
    }
  });
});
