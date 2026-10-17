import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GOOGLE_CALENDAR_SOURCE } from '@sysdesign/contracts';
import {
  ALL_GOOGLE_SCOPES,
  authorize,
  GOOGLE_ENV,
  GOOGLE_SCOPES,
  GoogleAuth,
  loadGrant,
  writeTokenFile,
} from '@sysdesign/google-kit';
import { EXIT, SessionRegistry, sessionCli } from '@sysdesign/tool-session';

import { AppModule } from './app/app.module';
import { CalendarRest } from './calendar';
import {
  googleCalendarConfigFromEnv,
  GoogleCalendarConfigError,
  PACKAGE_ROOT,
  type GoogleCalendarConfig,
} from './config';
import { readSettings } from './settings';

/**
 * `main.js serve` (the default) — the service on its port.
 * `main.js run --goal <mission.md> [--max-steps n] [--max-minutes n]` — one mission to its end.
 * `main.js authorize` — consent, once, for every Google scope the programs need.
 *
 * The configuration is read once here; a configuration problem exits 2 by name.
 */
const USAGE = `usage: google-calendar [serve | run --goal <mission.md> [--max-steps n] [--max-minutes n] | authorize]`;

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

/** The calendar as Google's, over the grant the credentials hold; refused by name without one or without the scope. */
function calendarOf(config: GoogleCalendarConfig): CalendarRest {
  const auth = new GoogleAuth(loadGrant(config.google, GOOGLE_ENV.refreshToken.name));
  auth.assertScopes(GOOGLE_SCOPES.calendar, GOOGLE_CALENDAR_SOURCE);
  return new CalendarRest(auth, fetch, config.settings.calendar.recovery);
}

async function serve(config: GoogleCalendarConfig): Promise<number> {
  const app = await NestFactory.create(
    AppModule.register({ config, calendar: calendarOf(config), watch: true }),
  );
  app.enableShutdownHooks();
  await app.listen(config.port);
  const logger = new Logger('Calendar');
  logger.log(`google-calendar listening on http://localhost:${config.port}/health`);
  for (const [kind, source] of Object.entries(config.settings.sources))
    logger.log(`${kind}: ${source}`);
  logger.log(
    `loop ${config.loopUrl} · bus ${config.notificationsUrl} · peers ${config.peerUrls.join(', ') || 'none'}`,
  );
  // The service runs until the process is told to stop; the promise never settles on its own.
  return new Promise<number>(() => undefined);
}

async function consent(config: GoogleCalendarConfig, io: CliIo): Promise<number> {
  const token = await authorize({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    scopes: ALL_GOOGLE_SCOPES,
    announce: (url) => {
      io.out(
        'Open this URL in a browser signed in as the account the services act as, and consent:',
      );
      io.out(url);
    },
  });
  writeTokenFile(config.google.tokenFile, token);
  io.out(`token written to ${config.google.tokenFile} with scopes: ${token.scopes.join(', ')}`);
  return EXIT.complete;
}

export async function cli(
  argv: readonly string[],
  io: CliIo = { out: console.log, err: console.error },
): Promise<number> {
  const [command = 'serve', ...rest] = argv;
  let config: GoogleCalendarConfig;
  try {
    config = googleCalendarConfigFromEnv(readSettings(PACKAGE_ROOT));
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return EXIT.usage;
  }
  try {
    switch (command) {
      case 'serve':
        return await serve(config);
      case 'authorize':
        return await consent(config, io);
      case 'run':
        return await sessionCli(
          ['run', ...rest],
          'google-calendar',
          async () => {
            // One mission beside the served process: the calendar is its to watch, not this one's.
            const app = await NestFactory.createApplicationContext(
              AppModule.register({ config, calendar: calendarOf(config), watch: false }),
              { logger: ['error', 'warn'] },
            );
            return { registry: app.get(SessionRegistry), close: () => app.close() };
          },
          io,
        );
      default:
        io.err(USAGE);
        return EXIT.usage;
    }
  } catch (error) {
    if (error instanceof GoogleCalendarConfigError) {
      io.err(error.message);
      return EXIT.usage;
    }
    throw error;
  }
}
