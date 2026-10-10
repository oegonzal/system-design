import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_RAILS,
  flagKey,
  headedOf,
  parseArgsOptions,
  positiveInteger,
  railsOf,
  SESSION_ENV,
  SESSION_FLAGS,
  sessionConfigFromEnv,
  SessionConfigError,
} from './config';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });

describe('the session configuration', () => {
  it('[BRW-7] declares every variable once with its default and reads them nowhere else', () => {
    expect(sessionConfigFromEnv({})).toEqual({
      loopUrl: 'http://localhost:3003',
      dumpDir: 'static/sessions',
      profilesDir: 'static/browser-profiles',
      subject: 'the subject',
    });
    expect(
      sessionConfigFromEnv({
        [SESSION_ENV.loopUrl.name]: 'http://loop.test:1234',
        [SESSION_ENV.dumpDir.name]: '/tmp/dumps',
        [SESSION_ENV.profilesDir.name]: ' /tmp/profiles ',
        [SESSION_ENV.subject.name]: 'Alex Example',
      }),
    ).toEqual({
      loopUrl: 'http://loop.test:1234',
      dumpDir: '/tmp/dumps',
      profilesDir: '/tmp/profiles',
      subject: 'Alex Example',
    });
    // A blank value is unset, not a blank directory.
    expect(sessionConfigFromEnv({ [SESSION_ENV.dumpDir.name]: '  ' }).dumpDir).toBe(
      'static/sessions',
    );
    expect(() => sessionConfigFromEnv({ [SESSION_ENV.loopUrl.name]: 'not a url' })).toThrow(
      new SessionConfigError('QUALITY_LOOP_URL must be a URL, got "not a url"'),
    );

    // Only this file reads the environment.
    const readers = sources(join(__dirname))
      .filter((path) => readFileSync(path, 'utf8').includes('process.env'))
      .map((path) => path.slice(__dirname.length + 1));
    expect(readers).toEqual(['config.ts']);
    // Every declared variable has a non-empty default, so an empty environment boots.
    for (const variable of Object.values(SESSION_ENV)) {
      expect(variable.name).toMatch(/^[A-Z_]+$/);
      expect(variable.fallback.length).toBeGreaterThan(0);
    }
  });

  it('[BRW-7] derives the option table from the flag declaration and validates each flag by name', () => {
    expect(parseArgsOptions()).toMatchObject({
      goal: { type: 'string' },
      'max-tasks': { type: 'string' },
      headed: { type: 'boolean' },
      json: { type: 'boolean' },
    });
    expect(Object.keys(parseArgsOptions())).toHaveLength(Object.keys(SESSION_FLAGS).length);
    expect(flagKey('maxFailures')).toBe('max-failures');

    expect(railsOf({})).toEqual(DEFAULT_RAILS);
    expect(flagKey('maxStalledSteps')).toBe('max-stalled-steps');
    expect(railsOf({ maxStalledSteps: '12' }).maxStalledSteps).toBe(12);
    expect(() => railsOf({ maxStalledSteps: '0' })).toThrow('--max-stalled-steps');
    expect(railsOf({ maxTasks: '2', maxMinutes: '5', maxFailures: '1' })).toEqual({
      targetDone: null,
      maxTasks: 2,
      maxMinutes: 5,
      maxConsecutiveFailures: 1,
      // Rails with no flag of their own come from the declaration, so adding one
      // cannot silently leave a session running without it.
      maxBrainFaults: DEFAULT_RAILS.maxBrainFaults,
      maxUnreadablePages: DEFAULT_RAILS.maxUnreadablePages,
      maxStalledSteps: DEFAULT_RAILS.maxStalledSteps,
    });
    expect(() => railsOf({ maxTasks: '0' })).toThrow(
      '--max-tasks must be a positive integer, got "0"',
    );
    expect(() => railsOf({ maxMinutes: '1.5' })).toThrow(
      '--max-minutes must be a positive integer',
    );
    expect(() => positiveInteger('many', 'limit')).toThrow('--limit must be a positive integer');
    expect(positiveInteger(undefined, 'limit')).toBeUndefined();

    // A target is the session's goal on `done` alone; a done unit spends the
    // task budget too, so a target above the budget is refused by name.
    expect(flagKey('targetDone')).toBe('target-done');
    expect(railsOf({ targetDone: '50', maxTasks: '50' })).toMatchObject({
      targetDone: 50,
      maxTasks: 50,
    });
    expect(() => railsOf({ targetDone: '50' })).toThrow(
      '--target-done 50 is above --max-tasks 10: every done unit spends the budget too, so the session would stop first — set --max-tasks to at least 50, more to leave room for failed units',
    );
    expect(() => railsOf({ targetDone: '0', maxTasks: '5' })).toThrow(
      '--target-done must be a positive integer',
    );

    expect(headedOf({})).toBe(true);
    expect(headedOf({ headless: true })).toBe(false);
    expect(headedOf({ headed: true })).toBe(true);
    expect(() => headedOf({ headed: true, headless: true })).toThrow(
      '--headed and --headless contradict each other',
    );
  });
});
