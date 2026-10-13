import { resolve } from 'node:path';

import { ADVISOR_ID_PATTERN, type SessionRailsDto } from '@sysdesign/contracts';

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
 * asks the quality loop, at `QUALITY_LOOP_URL`, and the loop owns the model;
 * it reaches the operator beyond the terminal through the notifications
 * service, at `NOTIFICATIONS_URL`, and asks what is on record of units beyond
 * the session at the advisors `UNIT_ADVISOR_URLS` lists — the mission names
 * which of them, the environment only where each is.
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
  sessions: {
    name: '--sessions',
    valued: true,
    help: 'a folder of session dumps whose operator answers are taught again',
  },
  dryRun: { name: '--dry-run', valued: false, help: 'plan what would be taught; post nothing' },
} as const;
export type SessionFlag = keyof typeof SESSION_FLAGS;

/** Every variable the session reads, with the value it takes when unset. */
export const SESSION_ENV = {
  loopUrl: { name: 'QUALITY_LOOP_URL', fallback: 'http://localhost:3003' },
  notificationsUrl: { name: 'NOTIFICATIONS_URL', fallback: 'http://localhost:3005' },
  dumpDir: { name: 'BROWSER_SESSION_DUMP_DIR', fallback: 'static/sessions' },
  profilesDir: { name: 'BROWSER_PROFILES_DIR', fallback: 'static/browser-profiles' },
  subject: { name: 'BROWSER_SESSION_SUBJECT', fallback: 'the subject' },
  advisors: { name: 'UNIT_ADVISOR_URLS', fallback: 'none' },
} as const;

/** The value that configures no advisor: a mission naming one is then refused by name, never run blind. */
export const NO_ADVISORS = 'none';

export const DEFAULT_LIST_LIMIT = 20;

/** The environment half of the configuration. */
export interface SessionEnv {
  loopUrl: string;
  notificationsUrl: string;
  dumpDir: string;
  profilesDir: string;
  /** Whom the operator's answers are about, by name, so a stored fact is self-contained. */
  subject: string;
  /** The advisors configured, in order; none under `none`. */
  advisors: AdvisorEntry[];
}

/**
 * One configured advisor: the id its entry named — or null for one the
 * session describes at boot to learn — its URL, and the entry as written,
 * for a refusal to name.
 */
export interface AdvisorEntry {
  id: string | null;
  url: string;
  text: string;
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

/** A variable that must be a URL, or a refusal naming it. */
const url = (env: NodeJS.ProcessEnv, variable: { name: string; fallback: string }): string => {
  const value = nonEmpty(env, variable);
  try {
    new URL(value);
  } catch {
    throw new SessionConfigError(`${variable.name} must be a URL, got ${JSON.stringify(value)}`);
  }
  return value;
};

/** `<id>=<url>`: whatever stands before the first `=` with no sign of being a URL itself is the id, held to the mission's grammar below. */
const KEYED_ENTRY = /^([^=:/\s]+)=(.+)$/;

/**
 * Comma-separated `[<id>=]<url>` entries, or `none`. An entry that is neither
 * — no URL, an id the grammar does not read, an id named twice — is refused by
 * variable name before anything boots.
 */
export function advisorEntries(
  env: NodeJS.ProcessEnv,
  variable: { name: string; fallback: string },
): AdvisorEntry[] {
  const value = nonEmpty(env, variable);
  if (value === NO_ADVISORS) return [];
  const entries = value
    .split(',')
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text): AdvisorEntry => {
      const keyed = KEYED_ENTRY.exec(text);
      const id = keyed?.[1] ?? null;
      const address = keyed?.[2] ?? text;
      if (id !== null && !ADVISOR_ID_PATTERN.test(id)) {
        throw new SessionConfigError(
          `${variable.name} entry ${JSON.stringify(text)} must be [<id>=]<url>, the id lower-case words joined by hyphens`,
        );
      }
      try {
        new URL(address);
      } catch {
        throw new SessionConfigError(
          `${variable.name} entry ${JSON.stringify(text)} must be [<id>=]<url>, got no URL`,
        );
      }
      return { id, url: address, text };
    });
  if (entries.length === 0) {
    throw new SessionConfigError(
      `${variable.name} must be ${NO_ADVISORS} or [<id>=]<url> entries, got ${JSON.stringify(value)}`,
    );
  }
  const ids = entries.map((entry) => entry.id).filter((id): id is string => id !== null);
  if (new Set(ids).size !== ids.length) {
    throw new SessionConfigError(`${variable.name} names an advisor id twice`);
  }
  return entries;
}

/**
 * The one read of the environment. A URL that does not parse, a directory
 * given as blank and an advisor entry that is neither `none` nor `[<id>=]<url>`
 * are refused here, by variable name, before anything boots.
 */
export function sessionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SessionEnv {
  return {
    loopUrl: url(env, SESSION_ENV.loopUrl),
    notificationsUrl: url(env, SESSION_ENV.notificationsUrl),
    dumpDir: nonEmpty(env, SESSION_ENV.dumpDir),
    profilesDir: nonEmpty(env, SESSION_ENV.profilesDir),
    subject: nonEmpty(env, SESSION_ENV.subject),
    advisors: advisorEntries(env, SESSION_ENV.advisors),
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
