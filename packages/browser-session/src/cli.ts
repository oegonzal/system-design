/**
 * `main.js run [--launch <name>] --goal <md> --profile <name> [--headed|--headless] [--max-tasks n] [--max-minutes n] [--max-failures n] [--max-stalled-steps n] [--wait-for-loop <minutes>]`
 * `main.js login --profile <name> --url <url>`
 * `main.js export-state --profile <name> --out <file> [--url <site>]`
 * `main.js sessions [--limit n] [--json]`
 * `main.js show <id> [--json]`
 * `main.js replay-events <id>`
 * `main.js teach-again --sessions <dir> [--subject <name>] [--tenant <name>] [--dry-run]`
 * `main.js replay-fields --sessions <dir> [--tenant <name>] [--sample n] [--judge] [--retract n] [--out <dir>]`
 *
 * `parseOptions` reads argv against the flags the command declares — a flag
 * the command does not read is refused by name, never ignored; `execute` runs
 * the options over the service and writes through `io`; `cli` loads the
 * configuration, boots the Nest context around them and exits by the result:
 * 2 for a usage or configuration problem — a database that has not applied
 * every migration this checkout carries, a session refused before it had a
 * row, by the brain the command binds or by the command — 1 for a failed
 * session or an unknown id, 0 otherwise; a session the rails or the operator
 * stopped is 0.
 */
import { parseArgs } from 'node:util';

import { EntityManager } from '@mikro-orm/postgresql';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { errorMessage, type SessionRailsDto } from '@sysdesign/contracts';
import { assertMigrated } from '@sysdesign/db';

import {
  DEFAULT_LIST_LIMIT,
  flagKey,
  headedOf,
  minutesOf,
  PACKAGE_ROOT,
  parseArgsOptions,
  positiveInteger,
  railsOf,
  SESSION_FLAGS,
  sessionConfigFromEnv,
  SessionConfigError,
  type SessionConfig,
  type SessionFlag,
  suppliedDocumentOf,
} from './config';
import type { SuppliedDocument } from './core/ports';
import { SessionRefused } from './core/unit-advice';
import {
  documentsWithLaunch,
  exportOrigins,
  railsWithLaunch,
  readLaunch,
  readLaunches,
  type Launch,
} from './launch';
import { AppModule } from './modules/app/app.module';
import { DEFAULT_REPLAYS_DIR } from './modules/session/replay-fields';
import { SessionService } from './modules/session/session.service';
import {
  renderOutcome,
  renderReplayFields,
  renderSession,
  renderSessions,
  renderTeachAgain,
} from './render';
import { readSessionSettings, type SessionDefaults } from './settings';

const flag = (key: SessionFlag): string => SESSION_FLAGS[key].name;

export const USAGE = `usage: browser-session <command> [options]
  run       [${flag('launch')} <name>] ${flag('goal')} <md> ${flag('profile')} <name> [${flag('url')} <url>] [${flag('headed')}|${flag('headless')}] [${flag('targetDone')} n] [${flag('maxTasks')} n] [${flag('maxMinutes')} n] [${flag('maxFailures')} n] [${flag('maxStalledSteps')} n] [${flag('subject')} <name>] [${flag('document')} <name>=<path> …] [${flag('waitForLoop')} <minutes>]
            every decision is a quality-loop run; the operator is asked at the terminal when a field needs a person;
            each ${flag('document')} supplies the file for a document the mission declares under Documents, by name;
            ${flag('launch')} reads launches/<name>.json — goal, profile, url, documents by file name under the documents dir,
            target, task and minute limits — a flag given beside it winning, ${flag('goal')} and ${flag('profile')} then optional;
            ${flag('waitForLoop')} asks the loop's health every 5 s for up to that many minutes before binding, refusing one that stays silent
  login     ${flag('profile')} <name> ${flag('url')} <url>
            opens the profile headed; sign in, press Enter; the profile keeps the cookies
  export-state ${flag('profile')} <name> ${flag('out')} <file> [${flag('url')} <site>]
            writes the profile's sign-in — cookies, local storage, IndexedDB — as JSON readable by you alone, for
            \`pnpm aws:files push <file> state/<name>.json\`; the local storage of each launch's site that names the profile travels,
            and of the site ${flag('url')} names; refused while a session holds the profile; delete the file once pushed
  sessions  [${flag('limit')} n] [${flag('json')}]
  show      <id> [${flag('json')}]
  replay-events <id>
            publishes a recorded session's events again, for a record that missed them
  teach-again ${flag('sessions')} <dir> [${flag('subject')} <name>] [${flag('tenant')} <name>] [${flag('dryRun')}]
            teaches the operator answers recorded in a folder of session dumps again, in the canonical
            shape, through the brain the settings choose — under the tenant named, else the environment's —
            each answer its own receipt; a brain that digests them on the loop has their earlier digests
            retracted once the new facts stand; the subject names whom a dump's own teachings do not; an
            answer on a channel the operator settings do not teach is left as it was
  replay-fields ${flag('sessions')} <dir> [${flag('tenant')} <name>] [${flag('sample')} n] [${flag('judge')}] [${flag('retract')} n] [${flag('out')} <dir>]
            recalls again, through the memory brain the settings choose, for every form page a folder of
            session dumps recorded — under the tenant named, else the environment's — and compares the
            evidence with what each recorded run was given; with ${flag('judge')} the pages are judged again and
            routed by the shipped answering settings, a sample drawn across the fields the operator answered;
            with ${flag('retract')} n that many recalled records are closed in the tenant replayed against and
            recalled for again; rows and a report land under <out>/<stamp> (${DEFAULT_REPLAYS_DIR} unless ${flag('out')} says)`;

/** What a command reads of the shared flags, so `parseArgs` refuses by name any flag a command would ignore. */
const RUN_FLAGS: readonly SessionFlag[] = [
  'goal',
  'profile',
  'url',
  'headed',
  'headless',
  'targetDone',
  'maxTasks',
  'maxMinutes',
  'maxFailures',
  'maxStalledSteps',
  'subject',
  'document',
  'launch',
  'waitForLoop',
];

/** The commands, as data: the flags each reads, what each takes as a positional, and whether it reads or writes the session's tables. */
export const COMMANDS = {
  run: { flags: RUN_FLAGS, positionals: 0, ledger: true },
  login: { flags: ['profile', 'url'], positionals: 0, ledger: false },
  // The lease a running session holds on a profile is a ledger fact, so an export reads the ledger.
  'export-state': { flags: ['profile', 'out', 'url'], positionals: 0, ledger: true },
  sessions: { flags: ['limit', 'json'], positionals: 0, ledger: true },
  show: { flags: ['json'], positionals: 1, ledger: true },
  'replay-events': { flags: [], positionals: 1, ledger: true },
  'teach-again': {
    flags: ['sessions', 'subject', 'tenant', 'dryRun'],
    positionals: 0,
    ledger: true,
  },
  'replay-fields': {
    flags: ['sessions', 'tenant', 'sample', 'judge', 'retract', 'out'],
    positionals: 0,
    ledger: true,
  },
} as const satisfies Record<
  string,
  { flags: readonly SessionFlag[]; positionals: number; ledger: boolean }
>;
export type Command = keyof typeof COMMANDS;

export type Options =
  | {
      command: 'run';
      goalPath: string;
      profile: string;
      headed: boolean;
      rails: SessionRailsDto;
      /** Unset means the configured subject; the service applies that default. */
      subject: string | undefined;
      /** Where to open the browser before the first plan; unset leaves it on about:blank. */
      startUrl: string | undefined;
      /** The files for the documents the mission declares, by name, as given. */
      documents: SuppliedDocument[];
      /** How long to wait for the loop before binding; 0 binds at once. */
      waitForLoopMinutes: number;
    }
  | { command: 'login'; profile: string; url: string }
  | {
      command: 'export-state';
      profile: string;
      out: string;
      /** The sites whose local storage and IndexedDB travel with the cookies: each launch's that names the profile, and --url's. */
      origins: string[];
    }
  | { command: 'sessions'; limit: number; json: boolean; staleAfterMs: number }
  | { command: 'show'; id: string; json: boolean; staleAfterMs: number }
  | { command: 'replay-events'; id: string }
  | {
      command: 'teach-again';
      sessions: string;
      subject: string | undefined;
      /** Unset means the environment's tenant; the brain refuses the placeholder by name when it binds. */
      tenant: string | undefined;
      dryRun: boolean;
    }
  | {
      command: 'replay-fields';
      sessions: string;
      /** Unset means the environment's tenant; the service applies that default and refuses the placeholder. */
      tenant: string | undefined;
      sample: number | null;
      judge: boolean;
      /** How many recalled records the retraction measure closes; null measures none. */
      retract: number | null;
      out: string;
    };

/** What `execute` writes to and how it is answered. */
export interface Io {
  out(text: string): void;
  error(text: string): void;
  now(): Date;
}

/** The slice of the service the CLI drives — the fake in the spec implements exactly this. */
export type CliService = Pick<
  SessionService,
  'run' | 'login' | 'exportState' | 'list' | 'show' | 'replayEvents' | 'teachAgain' | 'replayFields'
>;

/** The launch files, read and resolved — `readLaunch` and `readLaunches` as the CLI binds them; a spec's table. */
export interface LaunchSource {
  named(name: string): Launch;
  all(): Launch[];
}

const isCommand = (value: string | undefined): value is Command =>
  value !== undefined && Object.hasOwn(COMMANDS, value);

const required = (value: string | undefined, key: SessionFlag): string => {
  if (value === undefined || value.trim() === '') {
    throw new SessionConfigError(`${SESSION_FLAGS[key].name} is required`);
  }
  return value;
};

/** argv → options over the settings' defaults — and over the launch file, when one is named — or an Error whose message is the usage problem. */
export function parseOptions(
  argv: readonly string[],
  defaults: SessionDefaults,
  launches: LaunchSource,
): Options | Error {
  const [command, ...rest] = argv;
  if (!isCommand(command)) return new Error(USAGE);
  try {
    const { values, positionals } = parseArgs({
      args: [...rest],
      allowPositionals: true,
      options: parseArgsOptions(COMMANDS[command].flags),
    });
    if (positionals.length !== COMMANDS[command].positionals) {
      return new Error(
        `${command} takes ${COMMANDS[command].positionals === 0 ? 'no positional' : 'one id'}`,
      );
    }
    const text = (key: SessionFlag): string | undefined => {
      const value = values[flagKey(key)];
      return typeof value === 'string' ? value : undefined;
    };
    const on = (key: SessionFlag): boolean | undefined => {
      const value = values[flagKey(key)];
      return typeof value === 'boolean' ? value : undefined;
    };
    /** A repeatable flag's values, in the order given; none when it was not given. */
    const list = (key: SessionFlag): string[] => {
      const value = values[flagKey(key)];
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    };
    switch (command) {
      case 'run': {
        // The launch file stands where no flag does; a flag given wins over its field.
        const launchName = text('launch');
        const launch = launchName === undefined ? null : launches.named(launchName);
        return {
          command,
          goalPath: required(text('goal') ?? launch?.goal, 'goal'),
          profile: required(text('profile') ?? launch?.profile, 'profile'),
          headed: headedOf({ headed: on('headed'), headless: on('headless') }, defaults.headed),
          rails: railsOf(
            {
              targetDone: text('targetDone'),
              maxTasks: text('maxTasks'),
              maxMinutes: text('maxMinutes'),
              maxFailures: text('maxFailures'),
              maxStalledSteps: text('maxStalledSteps'),
            },
            railsWithLaunch(launch, defaults.rails),
          ),
          subject: text('subject'),
          startUrl: text('url') ?? launch?.url,
          documents: documentsWithLaunch(list('document').map(suppliedDocumentOf), launch),
          waitForLoopMinutes: minutesOf(text('waitForLoop'), 'waitForLoop'),
        };
      }
      case 'login':
        return {
          command,
          profile: required(text('profile'), 'profile'),
          url: required(text('url'), 'url'),
        };
      case 'export-state': {
        const profile = required(text('profile'), 'profile');
        return {
          command,
          profile,
          out: required(text('out'), 'out'),
          origins: exportOrigins(profile, launches.all(), text('url')),
        };
      }
      case 'sessions':
        return {
          command,
          limit: positiveInteger(text('limit'), 'limit') ?? DEFAULT_LIST_LIMIT,
          json: on('json') ?? false,
          staleAfterMs: defaults.liveness.staleAfterMs,
        };
      case 'show':
        return {
          command,
          id: positionals[0] ?? '',
          json: on('json') ?? false,
          staleAfterMs: defaults.liveness.staleAfterMs,
        };
      case 'replay-events':
        return { command, id: positionals[0] ?? '' };
      case 'teach-again':
        return {
          command,
          sessions: required(text('sessions'), 'sessions'),
          subject: text('subject'),
          tenant: text('tenant'),
          dryRun: on('dryRun') ?? false,
        };
      case 'replay-fields':
        return {
          command,
          sessions: required(text('sessions'), 'sessions'),
          tenant: text('tenant'),
          sample: positiveInteger(text('sample'), 'sample') ?? null,
          judge: on('judge') ?? false,
          retract: positiveInteger(text('retract'), 'retract') ?? null,
          out: text('out') ?? DEFAULT_REPLAYS_DIR,
        };
    }
  } catch (error) {
    return error instanceof Error ? error : new Error(errorMessage(error));
  }
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** The options over the service; the exit code. */
export async function execute(options: Options, service: CliService, io: Io): Promise<number> {
  try {
    switch (options.command) {
      case 'run': {
        const outcome = await service.run(options);
        io.out(renderOutcome(outcome));
        return outcome.status === 'failed' ? 1 : 0;
      }
      case 'login':
        await service.login(options.profile, options.url);
        io.out(`profile ${options.profile} closed; its cookies persist`);
        return 0;
      case 'export-state': {
        const { cookies, origins } = await service.exportState(
          options.profile,
          options.out,
          options.origins,
        );
        const sites =
          options.origins.length === 0
            ? `no launch names the profile and no ${flag('url')} was given, so the cookies alone travel`
            : `${origins} of the ${options.origins.length} site(s) visited held local storage`;
        io.out(
          `profile ${options.profile}: ${cookies} cookie(s) written to ${options.out} — ${sites}; the file is readable by you alone and is the sign-in: push it with\n  pnpm aws:files push ${options.out} state/${options.profile}.json\nthen delete it`,
        );
        return 0;
      }
      case 'sessions': {
        const sessions = await service.list(options.limit);
        io.out(
          options.json ? json(sessions) : renderSessions(sessions, io.now(), options.staleAfterMs),
        );
        return 0;
      }
      case 'show': {
        const detail = await service.show(options.id);
        if (detail === null) {
          io.error(`no session ${options.id}`);
          return 1;
        }
        io.out(options.json ? json(detail) : renderSession(detail, io.now(), options.staleAfterMs));
        return 0;
      }
      case 'replay-events': {
        const published = await service.replayEvents(options.id);
        if (published === null) {
          io.error(`no session ${options.id}`);
          return 1;
        }
        io.out(`${published} event(s) published again for session ${options.id}`);
        return 0;
      }
      case 'teach-again': {
        const report = await service.teachAgain(
          options.sessions,
          options.dryRun,
          options.subject,
          options.tenant,
        );
        io.out(renderTeachAgain(report));
        return 0;
      }
      case 'replay-fields': {
        const report = await service.replayFields({
          sessionsDir: options.sessions,
          tenant: options.tenant,
          sample: options.sample,
          judge: options.judge,
          retract: options.retract,
          out: options.out,
        });
        io.out(renderReplayFields(report));
        return 0;
      }
    }
  } catch (error) {
    io.error(errorMessage(error));
    // A session refused before it had a row is a configuration problem, like a bad flag.
    return error instanceof SessionRefused ? 2 : 1;
  }
}

export async function cli(argv: readonly string[]): Promise<number> {
  let config: SessionConfig;
  try {
    config = { ...sessionConfigFromEnv(), settings: readSessionSettings(PACKAGE_ROOT) };
  } catch (error) {
    console.error(errorMessage(error));
    return 2;
  }
  const options = parseOptions(argv, config.settings.session, {
    named: (name) => readLaunch(PACKAGE_ROOT, name, config.docsDir),
    all: () => readLaunches(PACKAGE_ROOT, config.docsDir),
  });
  if (options instanceof Error) {
    console.error(options.message);
    return 2;
  }
  // The ports are composed at boot and reach nothing: a brain binds to its
  // space when a run or a teaching asks it to, so a composition that fails
  // here is a fault in the program, said and exited as a failure — Nest's own
  // abort would exit the same way, saying nothing.
  let app: INestApplicationContext;
  try {
    app = await NestFactory.createApplicationContext(AppModule.register(config), {
      logger: ['error', 'warn'],
      abortOnError: false,
    });
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }
  try {
    // The tables this checkout reads and writes must be the tables the
    // database has: one behind it stops here, naming the migrations to apply,
    // before the browser opens or a row is touched.
    if (COMMANDS[options.command].ledger) {
      try {
        await assertMigrated(app.get(EntityManager));
      } catch (error) {
        console.error(errorMessage(error));
        return 2;
      }
    }
    const service = app.get(SessionService);
    return await execute(options, service, {
      out: (text) => console.log(text),
      error: (text) => console.error(text),
      now: () => new Date(),
    });
  } finally {
    await app.close();
  }
}
