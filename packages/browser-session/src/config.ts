import { resolve } from 'node:path';

import type { SessionRailsDto } from '@sysdesign/contracts';

import type { SessionSettings } from './settings';

/**
 * The session's configuration, declared once.
 *
 * Every flag the command line takes and every variable the program reads is
 * named here as data, with its default, and parsed into typed values by the
 * functions below — which refuse by name anything they cannot use. How a
 * session runs when its flags say nothing, and what it images, are files in
 * the package's own `config/`, read by `settings.ts`; a flag overrides its
 * field for one run. Nothing else in the package reads the environment: the
 * CLI hands `parseArgs` the option table built from `SESSION_FLAGS`, and the
 * module receives the `SessionConfig` object. `config.spec.ts` holds the
 * package to that.
 *
 * Model access is deliberately absent: the session never calls a model. It
 * asks the quality loop, at `QUALITY_LOOP_URL`, and the loop owns the model.
 */

/** The package itself — `dist/..` as built, `src/..` under test — whose `config/` holds the settings. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Every flag the CLI takes; a switch stands alone, a valued flag takes the next word. */
export const SESSION_FLAGS = {
  goal: { name: '--goal', valued: true, help: 'the mission, a markdown file' },
  profile: { name: '--profile', valued: true, help: 'a persistent Chrome profile, by name' },
  url: {
    name: '--url',
    valued: true,
    help: 'where to open the browser: the sign-in page for login, the start page for run',
  },
  headed: { name: '--headed', valued: false, help: 'show the browser' },
  headless: { name: '--headless', valued: false, help: 'run without a window' },
  targetDone: {
    name: '--target-done',
    valued: true,
    help: 'end the session complete once this many units of work close done',
  },
  maxTasks: {
    name: '--max-tasks',
    valued: true,
    help: 'units of work the session may close done or failed; one found already done or set aside spends none',
  },
  maxMinutes: { name: '--max-minutes', valued: true, help: 'wall-clock minutes before it stops' },
  maxFailures: {
    name: '--max-failures',
    valued: true,
    help: 'consecutive failed steps before it stops',
  },
  maxStalledSteps: {
    name: '--max-stalled-steps',
    valued: true,
    help: 'observations in a row of a page that did not change before it stops',
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
  subject: { name: 'BROWSER_SESSION_SUBJECT', fallback: 'the subject' },
} as const;

export const DEFAULT_LIST_LIMIT = 20;

/** The environment half of the configuration. */
export interface SessionEnv {
  loopUrl: string;
  dumpDir: string;
  profilesDir: string;
  /** Whom the operator's answers are about, by name, so a stored fact is self-contained. */
  subject: string;
}

/** What the module is composed from: the environment, and the settings files. */
export interface SessionConfig extends SessionEnv {
  settings: SessionSettings;
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
export function sessionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SessionEnv {
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

/**
 * Whether a session's target fits its task budget: every unit closed `done`
 * spends the budget too, so a target above it would never be reached — the
 * budget would end the session first. One rule for the settings file and the
 * flags alike.
 */
export const targetWithinBudget = (
  rails: Pick<SessionRailsDto, 'targetDone' | 'maxTasks'>,
): boolean => rails.targetDone === null || rails.targetDone <= rails.maxTasks;

/** The rails as the flags set them, over the settings'. A target above the task budget is refused by name. */
export function railsOf(
  values: {
    targetDone?: string;
    maxTasks?: string;
    maxMinutes?: string;
    maxFailures?: string;
    maxStalledSteps?: string;
  },
  base: SessionRailsDto,
): SessionRailsDto {
  const targetDone = positiveInteger(values.targetDone, 'targetDone') ?? base.targetDone;
  const maxTasks = positiveInteger(values.maxTasks, 'maxTasks') ?? base.maxTasks;
  if (!targetWithinBudget({ targetDone, maxTasks })) {
    throw new SessionConfigError(
      `${SESSION_FLAGS.targetDone.name} ${targetDone} is above ${SESSION_FLAGS.maxTasks.name} ${maxTasks}: every done unit spends the budget too, so the session would stop first — set ${SESSION_FLAGS.maxTasks.name} to at least ${targetDone}, more to leave room for failed units`,
    );
  }
  return {
    targetDone,
    maxTasks,
    maxMinutes: positiveInteger(values.maxMinutes, 'maxMinutes') ?? base.maxMinutes,
    maxConsecutiveFailures:
      positiveInteger(values.maxFailures, 'maxFailures') ?? base.maxConsecutiveFailures,
    maxBrainFaults: base.maxBrainFaults,
    maxUnreadablePages: base.maxUnreadablePages,
    maxStalledSteps:
      positiveInteger(values.maxStalledSteps, 'maxStalledSteps') ?? base.maxStalledSteps,
  };
}

/** The settings' choice unless a flag says otherwise; both flags at once is a contradiction, refused by name. */
export function headedOf(values: { headed?: boolean; headless?: boolean }, base: boolean): boolean {
  if (values.headed === true && values.headless === true) {
    throw new SessionConfigError(
      `${SESSION_FLAGS.headed.name} and ${SESSION_FLAGS.headless.name} contradict each other`,
    );
  }
  if (values.headless === true) return false;
  return values.headed ?? base;
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
