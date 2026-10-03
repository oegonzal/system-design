/**
 * `main.js run --goal <md> --profile <name> [--headed|--headless] [--max-tasks n] [--max-minutes n] [--max-failures n]`
 * `main.js login --profile <name> --url <url>`
 * `main.js sessions [--limit n] [--json]`
 * `main.js show <id> [--json]`
 *
 * `parseOptions` reads argv against the declared flags; `execute` runs the
 * options over the service and writes through `io`; `cli` loads the
 * configuration, boots the Nest context around them and exits by the result:
 * 2 for a usage or configuration problem, 1 for a failed session or an
 * unknown id, 0 otherwise — a session the rails or the operator stopped is 0.
 */
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import type { SessionRailsDto } from '@sysdesign/contracts';

import {
  DEFAULT_LIST_LIMIT,
  flagKey,
  headedOf,
  parseArgsOptions,
  positiveInteger,
  railsOf,
  SESSION_FLAGS,
  sessionConfigFromEnv,
  SessionConfigError,
} from './config';
import { AppModule } from './modules/app/app.module';
import { SessionService } from './modules/session/session.service';
import { renderOutcome, renderSession, renderSessions } from './render';

const flag = (key: keyof typeof SESSION_FLAGS): string => SESSION_FLAGS[key].name;

export const USAGE = `usage: browser-session <command> [options]
  run       ${flag('goal')} <md> ${flag('profile')} <name> [${flag('headed')}|${flag('headless')}] [${flag('maxTasks')} n] [${flag('maxMinutes')} n] [${flag('maxFailures')} n] [${flag('subject')} <name>]
            every decision is a quality-loop run; the operator is asked at the terminal when a field needs a person
  login     ${flag('profile')} <name> ${flag('url')} <url>
            opens the profile headed; sign in, press Enter; the profile keeps the cookies
  sessions  [${flag('limit')} n] [${flag('json')}]
  show      <id> [${flag('json')}]`;

/** The commands, as data: what each takes as a positional. */
export const COMMANDS = {
  run: { positionals: 0 },
  login: { positionals: 0 },
  sessions: { positionals: 0 },
  show: { positionals: 1 },
} as const;
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
    }
  | { command: 'login'; profile: string; url: string }
  | { command: 'sessions'; limit: number; json: boolean }
  | { command: 'show'; id: string; json: boolean };

/** What `execute` writes to and how it is answered. */
export interface Io {
  out(text: string): void;
  error(text: string): void;
  now(): Date;
}

/** The slice of the service the CLI drives — the fake in the spec implements exactly this. */
export type CliService = Pick<SessionService, 'run' | 'login' | 'list' | 'show'>;

const isCommand = (value: string | undefined): value is Command =>
  value !== undefined && Object.hasOwn(COMMANDS, value);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const required = (value: string | undefined, key: keyof typeof SESSION_FLAGS): string => {
  if (value === undefined || value.trim() === '') {
    throw new SessionConfigError(`${SESSION_FLAGS[key].name} is required`);
  }
  return value;
};

/** argv → options, or an Error whose message is the usage problem. */
export function parseOptions(argv: readonly string[]): Options | Error {
  const [command, ...rest] = argv;
  if (!isCommand(command)) return new Error(USAGE);
  try {
    const { values, positionals } = parseArgs({
      args: [...rest],
      allowPositionals: true,
      options: parseArgsOptions(),
    });
    if (positionals.length !== COMMANDS[command].positionals) {
      return new Error(
        `${command} takes ${COMMANDS[command].positionals === 0 ? 'no positional' : 'one id'}`,
      );
    }
    const text = (key: keyof typeof SESSION_FLAGS): string | undefined => {
      const value = values[flagKey(key)];
      return typeof value === 'string' ? value : undefined;
    };
    const on = (key: keyof typeof SESSION_FLAGS): boolean | undefined => {
      const value = values[flagKey(key)];
      return typeof value === 'boolean' ? value : undefined;
    };
    switch (command) {
      case 'run':
        return {
          command,
          goalPath: required(text('goal'), 'goal'),
          profile: required(text('profile'), 'profile'),
          headed: headedOf({ headed: on('headed'), headless: on('headless') }),
          rails: railsOf({
            maxTasks: text('maxTasks'),
            maxMinutes: text('maxMinutes'),
            maxFailures: text('maxFailures'),
          }),
          subject: text('subject'),
        };
      case 'login':
        return {
          command,
          profile: required(text('profile'), 'profile'),
          url: required(text('url'), 'url'),
        };
      case 'sessions':
        return {
          command,
          limit: positiveInteger(text('limit'), 'limit') ?? DEFAULT_LIST_LIMIT,
          json: on('json') ?? false,
        };
      case 'show':
        return { command, id: positionals[0] ?? '', json: on('json') ?? false };
    }
  } catch (error) {
    return error instanceof Error ? error : new Error(messageOf(error));
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
      case 'sessions': {
        const sessions = await service.list(options.limit);
        io.out(options.json ? json(sessions) : renderSessions(sessions, io.now()));
        return 0;
      }
      case 'show': {
        const detail = await service.show(options.id);
        if (detail === null) {
          io.error(`no session ${options.id}`);
          return 1;
        }
        io.out(options.json ? json(detail) : renderSession(detail, io.now()));
        return 0;
      }
    }
  } catch (error) {
    io.error(messageOf(error));
    return 1;
  }
}

export async function cli(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  if (options instanceof Error) {
    console.error(options.message);
    return 2;
  }
  let config;
  try {
    config = sessionConfigFromEnv();
  } catch (error) {
    console.error(messageOf(error));
    return 2;
  }
  const app = await NestFactory.createApplicationContext(AppModule.register(config), {
    logger: ['error', 'warn'],
  });
  try {
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
