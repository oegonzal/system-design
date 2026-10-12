import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  JOB_APPLICATION_ENV,
  jobApplicationConfigFromEnv,
  JobApplicationConfigError,
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

  it('[JA-8] declares every variable once with its default and reads them nowhere else', () => {
    expect(jobApplicationConfigFromEnv(shipped, {})).toMatchObject({
      port: 3006,
      notificationsUrl: 'http://localhost:3005',
    });
    expect(
      jobApplicationConfigFromEnv(shipped, {
        [JOB_APPLICATION_ENV.port.name]: ' 3106 ',
        [JOB_APPLICATION_ENV.notificationsUrl.name]: 'http://bus.test:4321',
      }),
    ).toMatchObject({ port: 3106, notificationsUrl: 'http://bus.test:4321' });
    expect(() =>
      jobApplicationConfigFromEnv(shipped, { [JOB_APPLICATION_ENV.port.name]: 'many' }),
    ).toThrow(
      new JobApplicationConfigError('JOB_APPLICATION_PORT must be a port number, got "many"'),
    );
    expect(() =>
      jobApplicationConfigFromEnv(shipped, { [JOB_APPLICATION_ENV.notificationsUrl.name]: 'bus' }),
    ).toThrow(new JobApplicationConfigError('NOTIFICATIONS_URL must be a URL, got "bus"'));

    // Only this file reads the environment.
    const readers = sources(join(__dirname))
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
    for (const variable of Object.values(JOB_APPLICATION_ENV)) {
      expect(variable.name).toMatch(/^[A-Z_]+$/);
      expect(variable.fallback.length).toBeGreaterThan(0);
    }
  });
});
