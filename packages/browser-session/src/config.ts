import type { SessionRailsDto } from '@sysdesign/contracts';

/**
 * The session's configuration, declared once.
 *
 * Every flag the command line takes and every variable the program reads is
 * named here as data, with its default, and parsed into typed values by the
 * functions below — which refuse by name anything they cannot use. Nothing
 * else in the package reads the environment: the CLI hands `parseArgs` the
 * option table built from `SESSION_FLAGS`, and the module receives the
 * `SessionConfig` object. `config.spec.ts` holds the package to that.
 *
 * Model access is deliberately absent: the session never calls a model. It
 * asks the quality loop, at `QUALITY_LOOP_URL`, and the loop owns the model.
 */

/** Every flag the CLI takes; a switch stands alone, a valued flag takes the next word. */
export const SESSION_FLAGS = {
  goal: { name: '--goal', valued: true, help: 'the mission, a markdown file' },
  profile: { name: '--profile', valued: true, help: 'a persistent Chrome profile, by name' },
  url: { name: '--url', valued: true, help: 'where to open the profile for signing in' },
  headed: { name: '--headed', valued: false, help: 'show the browser (the default)' },
  headless: { name: '--headless', valued: false, help: 'run without a window' },
  maxTasks: { name: '--max-tasks', valued: true, help: 'units of work the session may close' },
  maxMinutes: { name: '--max-minutes', valued: true, help: 'wall-clock minutes before it stops' },
  maxFailures: {
    name: '--max-failures',
    valued: true,
    help: 'consecutive failed steps before it stops',
  },
  subject: { name: '--subject', valued: true, help: "whom the operator's answers are about" },
  limit: { name: '--limit', valued: true, help: 'how many sessions to list' },
  json: { name: '--json', valued: false, help: 'print the records as JSON' },
} as const;
export type SessionFlag = keyof typeof SESSION_FLAGS;

/** Every variable the session reads, with the value it takes when unset. */
export const SESSION_ENV = {
  loopUrl: { name: 'QUALITY_LOOP_URL', fallback: 'http://localhost:3003' },
  dumpDir: { name: 'BROWSER_SESSION_DUMP_DIR', fallback: 'static/sessions' },
  profilesDir: { name: 'BROWSER_PROFILES_DIR', fallback: 'static/browser-profiles' },
  subject: { name: 'BROWSER_SESSION_SUBJECT', fallback: 'the applicant' },
} as const;

/** The engine's stop rules when the flags leave them alone; `maxBrainFaults` has no flag. */
export const DEFAULT_RAILS: SessionRailsDto = {
  maxTasks: 10,
  maxMinutes: 60,
  maxConsecutiveFailures: 3,
  maxBrainFaults: 3,
  maxUnreadablePages: 3,
};

/** A session shows its browser unless told otherwise: the operator is expected to watch. */
export const DEFAULT_HEADED = true;
export const DEFAULT_LIST_LIMIT = 20;

/** What the module is composed from: the environment half of the configuration. */
export interface SessionConfig {
  loopUrl: string;
  dumpDir: string;
  profilesDir: string;
  /** Whom the operator's answers are about, by name, so a stored fact is self-contained. */
  subject: string;
}

export class SessionConfigError extends Error {
  override readonly name = 'SessionConfigError';
}

const set = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
};

const nonEmpty = (env: NodeJS.ProcessEnv, variable: { name: string; fallback: string }): string =>
  set(env, variable.name) ?? variable.fallback;

/**
 * The one read of the environment. A URL that does not parse and a directory
 * given as blank are refused here, by variable name, before anything boots.
 */
export function sessionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SessionConfig {
  const loopUrl = nonEmpty(env, SESSION_ENV.loopUrl);
  try {
    new URL(loopUrl);
  } catch {
    throw new SessionConfigError(
      `${SESSION_ENV.loopUrl.name} must be a URL, got ${JSON.stringify(loopUrl)}`,
    );
  }
  return {
    loopUrl,
    dumpDir: nonEmpty(env, SESSION_ENV.dumpDir),
    profilesDir: nonEmpty(env, SESSION_ENV.profilesDir),
    subject: nonEmpty(env, SESSION_ENV.subject),
  };
}

/** A flag's value as a positive integer, or a refusal naming the flag. */
export function positiveInteger(raw: string | undefined, flag: SessionFlag): number | undefined {
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) <= 0) {
    throw new SessionConfigError(
      `${SESSION_FLAGS[flag].name} must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

/** The rails as the flags set them, over the defaults. */
export function railsOf(values: {
  maxTasks?: string;
  maxMinutes?: string;
  maxFailures?: string;
}): SessionRailsDto {
  return {
    maxTasks: positiveInteger(values.maxTasks, 'maxTasks') ?? DEFAULT_RAILS.maxTasks,
    maxMinutes: positiveInteger(values.maxMinutes, 'maxMinutes') ?? DEFAULT_RAILS.maxMinutes,
    maxConsecutiveFailures:
      positiveInteger(values.maxFailures, 'maxFailures') ?? DEFAULT_RAILS.maxConsecutiveFailures,
    maxBrainFaults: DEFAULT_RAILS.maxBrainFaults,
    maxUnreadablePages: DEFAULT_RAILS.maxUnreadablePages,
  };
}

/** Headed unless `--headless`; both at once is a contradiction, refused by name. */
export function headedOf(values: { headed?: boolean; headless?: boolean }): boolean {
  if (values.headed === true && values.headless === true) {
    throw new SessionConfigError(
      `${SESSION_FLAGS.headed.name} and ${SESSION_FLAGS.headless.name} contradict each other`,
    );
  }
  if (values.headless === true) return false;
  return values.headed ?? DEFAULT_HEADED;
}

/** The `parseArgs` option table, derived from the declaration so no flag is spelled twice. */
export function parseArgsOptions(): Record<string, { type: 'string' | 'boolean' }> {
  return Object.fromEntries(
    Object.values(SESSION_FLAGS).map((flag) => [
      flag.name.slice(2),
      { type: flag.valued ? 'string' : 'boolean' },
    ]),
  );
}

/** A flag's value as `parseArgs` keys it: by its long name without the dashes. */
export const flagKey = (flag: SessionFlag): string => SESSION_FLAGS[flag].name.slice(2);
