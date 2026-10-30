import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  advisorEntries,
  flagKey,
  headedOf,
  NO_ADVISORS,
  NO_TENANT,
  parseArgsOptions,
  positiveInteger,
  railsOf,
  SESSION_ENV,
  SESSION_FLAGS,
  sessionConfigFromEnv,
  SessionConfigError,
  type SessionFlag,
  suppliedDocumentOf,
} from './config';
import { SPEC_RAILS } from './core/testing-session';

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
      notificationsUrl: 'http://localhost:3005',
      dumpDir: 'static/sessions',
      profilesDir: 'static/browser-profiles',
      subject: 'the subject',
      advisors: [],
      memoryUrl: 'http://localhost:3007',
      memoryTenant: 'none',
    });
    expect(
      sessionConfigFromEnv({
        [SESSION_ENV.loopUrl.name]: 'http://loop.test:1234',
        [SESSION_ENV.notificationsUrl.name]: 'http://bus.test:4321',
        [SESSION_ENV.dumpDir.name]: '/tmp/dumps',
        [SESSION_ENV.profilesDir.name]: ' /tmp/profiles ',
        [SESSION_ENV.subject.name]: 'Alex Example',
        [SESSION_ENV.advisors.name]: 'record=http://advisor.test:3006, http://other.test',
        [SESSION_ENV.memoryUrl.name]: 'http://memory.test:7',
        [SESSION_ENV.memoryTenant.name]: ' verify-2026 ',
      }),
    ).toEqual({
      loopUrl: 'http://loop.test:1234',
      notificationsUrl: 'http://bus.test:4321',
      dumpDir: '/tmp/dumps',
      profilesDir: '/tmp/profiles',
      subject: 'Alex Example',
      advisors: [
        { id: 'record', url: 'http://advisor.test:3006', text: 'record=http://advisor.test:3006' },
        { id: null, url: 'http://other.test', text: 'http://other.test' },
      ],
      memoryUrl: 'http://memory.test:7',
      memoryTenant: 'verify-2026',
    });
    // The two values that configure nothing are the declared fallbacks, so a module refuses them by
    // the one name each; what to refuse is the module's decision at boot, not a parse rule here — a
    // brain deciding through the loop alone never reads the tenant.
    expect(SESSION_ENV.advisors.fallback).toBe(NO_ADVISORS);
    expect(SESSION_ENV.memoryTenant.fallback).toBe(NO_TENANT);
    expect(() => sessionConfigFromEnv({ [SESSION_ENV.memoryUrl.name]: 'host' })).toThrow(
      new SessionConfigError('AGENTIC_SYSTEM_URL must be a URL, got "host"'),
    );
    // An advisor entry is `none`, or `[<id>=]<url>` in the grammar a mission names an advisor by.
    expect(advisorEntries({}, SESSION_ENV.advisors)).toEqual([]);
    const entries = (value: string) => () =>
      advisorEntries({ [SESSION_ENV.advisors.name]: value }, SESSION_ENV.advisors);
    expect(entries('Record=http://advisor.test')).toThrow(
      'UNIT_ADVISOR_URLS entry "Record=http://advisor.test" must be [<id>=]<url>, the id lower-case words joined by hyphens',
    );
    expect(entries('record=nowhere')).toThrow('must be [<id>=]<url>, got no URL');
    expect(entries('record=http://a.test,record=http://b.test')).toThrow(
      'UNIT_ADVISOR_URLS names an advisor id twice',
    );
    expect(entries(' , ')).toThrow('UNIT_ADVISOR_URLS must be none or [<id>=]<url> entries');
    // A URL with a query is still one entry, never split at its `=`.
    expect(entries('http://advisor.test/?tenant=a')()).toEqual([
      { id: null, url: 'http://advisor.test/?tenant=a', text: 'http://advisor.test/?tenant=a' },
    ]);
    // A blank value is unset, not a blank directory.
    expect(sessionConfigFromEnv({ [SESSION_ENV.dumpDir.name]: '  ' }).dumpDir).toBe(
      'static/sessions',
    );
    expect(() => sessionConfigFromEnv({ [SESSION_ENV.loopUrl.name]: 'not a url' })).toThrow(
      new SessionConfigError('QUALITY_LOOP_URL must be a URL, got "not a url"'),
    );
    expect(() => sessionConfigFromEnv({ [SESSION_ENV.notificationsUrl.name]: 'bus' })).toThrow(
      new SessionConfigError('NOTIFICATIONS_URL must be a URL, got "bus"'),
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

  it('[BRW-7] derives the option table from the flag declaration for the flags a command reads, and validates each flag by name', () => {
    const every = Object.keys(SESSION_FLAGS) as SessionFlag[];
    expect(parseArgsOptions(every)).toMatchObject({
      goal: { type: 'string' },
      'max-tasks': { type: 'string' },
      headed: { type: 'boolean' },
      json: { type: 'boolean' },
      // Teaching again and replaying address a tenant of their own; a replay samples, judges, closes a sample and writes somewhere.
      tenant: { type: 'string' },
      sample: { type: 'string' },
      judge: { type: 'boolean' },
      retract: { type: 'string' },
      out: { type: 'string' },
      // A document is supplied per flag, so the flag collects its values.
      document: { type: 'string', multiple: true },
    });
    expect(flagKey('tenant')).toBe('tenant');
    expect(flagKey('dryRun')).toBe('dry-run');
    expect(Object.keys(parseArgsOptions(every))).toHaveLength(every.length);
    // A command's table holds the flags it reads alone, so one it would ignore is refused by name instead.
    expect(parseArgsOptions(['sessions', 'dryRun'])).toEqual({
      sessions: { type: 'string' },
      'dry-run': { type: 'boolean' },
    });
    expect(flagKey('maxFailures')).toBe('max-failures');

    expect(railsOf({}, SPEC_RAILS)).toEqual(SPEC_RAILS);
    expect(flagKey('maxStalledSteps')).toBe('max-stalled-steps');
    expect(railsOf({ maxStalledSteps: '12' }, SPEC_RAILS).maxStalledSteps).toBe(12);
    expect(() => railsOf({ maxStalledSteps: '0' }, SPEC_RAILS)).toThrow('--max-stalled-steps');
    expect(railsOf({ maxTasks: '2', maxMinutes: '5', maxFailures: '1' }, SPEC_RAILS)).toEqual({
      targetDone: null,
      maxTasks: 2,
      maxMinutes: 5,
      maxConsecutiveFailures: 1,
      // Rails with no flag of their own come from the settings, so adding one
      // cannot silently leave a session running without it.
      maxBrainFaults: SPEC_RAILS.maxBrainFaults,
      maxUnreadablePages: SPEC_RAILS.maxUnreadablePages,
      maxStalledSteps: SPEC_RAILS.maxStalledSteps,
    });
    expect(() => railsOf({ maxTasks: '0' }, SPEC_RAILS)).toThrow(
      '--max-tasks must be a positive integer, got "0"',
    );
    expect(() => railsOf({ maxMinutes: '1.5' }, SPEC_RAILS)).toThrow(
      '--max-minutes must be a positive integer',
    );
    expect(() => positiveInteger('many', 'limit')).toThrow('--limit must be a positive integer');
    expect(positiveInteger(undefined, 'limit')).toBeUndefined();

    // A target is the session's goal on `done` alone; a done unit spends the
    // task budget too, so a target above the budget is refused by name.
    expect(flagKey('targetDone')).toBe('target-done');
    expect(railsOf({ targetDone: '50', maxTasks: '50' }, SPEC_RAILS)).toMatchObject({
      targetDone: 50,
      maxTasks: 50,
    });
    expect(() => railsOf({ targetDone: '50' }, SPEC_RAILS)).toThrow(
      '--target-done 50 is above --max-tasks 10: every done unit spends the budget too, so the session would stop first — set --max-tasks to at least 50, more to leave room for failed units',
    );
    expect(() => railsOf({ targetDone: '0', maxTasks: '5' }, SPEC_RAILS)).toThrow(
      '--target-done must be a positive integer',
    );

    // Neither flag: the settings decide; either flag decides for one run.
    expect(headedOf({}, true)).toBe(true);
    expect(headedOf({}, false)).toBe(false);
    expect(headedOf({ headless: true }, true)).toBe(false);
    expect(headedOf({ headed: true }, false)).toBe(true);
    expect(() => headedOf({ headed: true, headless: true }, true)).toThrow(
      '--headed and --headless contradict each other',
    );
  });

  it('[BRW-26] reads a supplied document as <name>=<path>, the name as a mission declares one, and refuses anything else by name', () => {
    expect(suppliedDocumentOf('resume=docs/resume.pdf')).toEqual({
      name: 'resume',
      path: 'docs/resume.pdf',
    });
    // The path may hold an equals sign of its own; the first one ends the name.
    expect(suppliedDocumentOf('cover-letter=/tmp/a=b.pdf')).toEqual({
      name: 'cover-letter',
      path: '/tmp/a=b.pdf',
    });
    for (const raw of ['resume', 'resume=', 'Resume=/x.pdf', '=/x.pdf', 'my resume=/x.pdf']) {
      expect(() => suppliedDocumentOf(raw)).toThrow(SessionConfigError);
      expect(() => suppliedDocumentOf(raw)).toThrow(`--document takes <name>=<path>`);
    }
  });
});
