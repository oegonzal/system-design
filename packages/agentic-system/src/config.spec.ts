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
    // The exact rows: the vector index is a table in the database the db package names, so no store variable stands here.
    expect(Object.values(AGENTIC_SYSTEM_ENV).map(({ name }) => name)).toEqual([
      'AGENTIC_SYSTEM_PORT',
      'QUALITY_LOOP_URL',
      'NOTIFICATIONS_URL',
    ]);
    expect(agenticSystemConfigFromEnv(shipped, {})).toMatchObject({
      port: 3007,
      loopUrl: 'http://localhost:3003',
      notificationsUrl: 'http://localhost:3005',
    });
    expect(
      agenticSystemConfigFromEnv(shipped, {
        [AGENTIC_SYSTEM_ENV.port.name]: ' 3107 ',
        [AGENTIC_SYSTEM_ENV.loopUrl.name]: 'http://loop:1',
        [AGENTIC_SYSTEM_ENV.notificationsUrl.name]: 'http://bus:2',
      }),
    ).toMatchObject({ port: 3107, loopUrl: 'http://loop:1', notificationsUrl: 'http://bus:2' });
    expect(() =>
      agenticSystemConfigFromEnv(shipped, { [AGENTIC_SYSTEM_ENV.port.name]: 'many' }),
    ).toThrow(
      new AgenticSystemConfigError('AGENTIC_SYSTEM_PORT must be a port number, got "many"'),
    );
    expect(() =>
      agenticSystemConfigFromEnv(shipped, { [AGENTIC_SYSTEM_ENV.notificationsUrl.name]: 'nope' }),
    ).toThrow(new AgenticSystemConfigError('NOTIFICATIONS_URL must be a URL, got "nope"'));
    expect(() =>
      agenticSystemConfigFromEnv(shipped, { [AGENTIC_SYSTEM_ENV.loopUrl.name]: 'loop' }),
    ).toThrow(new AgenticSystemConfigError('QUALITY_LOOP_URL must be a URL, got "loop"'));

    const readers = sources(__dirname)
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
    for (const variable of Object.values(AGENTIC_SYSTEM_ENV)) {
      expect(variable.name).toMatch(/^[A-Z_]+$/);
      expect(variable.fallback.length).toBeGreaterThan(0);
    }
  });

  it('[AGS-5] builds the embedder in the same read, by the llm package’s own variables, disabled without a key', () => {
    const disabled = agenticSystemConfigFromEnv(shipped, {}).embedder;
    expect(disabled).toMatchObject({ enabled: false, model: null, reason: 'no-key' });
    const keyed = agenticSystemConfigFromEnv(shipped, {
      OPENAI_API_KEY: 'k',
      OPENAI_EMBEDDING_MODEL: 'an-embedding-model',
    }).embedder;
    expect(keyed).toMatchObject({ enabled: true, model: 'an-embedding-model', reason: null });
    // The llm package declares those names; they are not declared a second time here.
    expect(Object.values(AGENTIC_SYSTEM_ENV).map(({ name }) => name)).not.toContain(
      'OPENAI_API_KEY',
    );
  });
});
