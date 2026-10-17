import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GMAIL_SOURCE } from '@sysdesign/contracts';
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
import { gmailConfigFromEnv, GmailConfigError, PACKAGE_ROOT, type GmailConfig } from './config';
import { GmailRest } from './mailbox';
import { readSettings } from './settings';

/**
 * `main.js serve` (the default) — the service on its port.
 * `main.js run --goal <mission.md> [--max-steps n] [--max-minutes n]` — one mission to its end.
 * `main.js authorize` — consent, once, for every Google scope the programs need.
 *
 * The configuration is read once here; a configuration problem exits 2 by name.
 */
const USAGE = `usage: gmail [serve | run --goal <mission.md> [--max-steps n] [--max-minutes n] | authorize]`;

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

/** The mailbox as Gmail, over the grant the credentials hold; refused by name without one or without the scope. */
function mailboxOf(config: GmailConfig): GmailRest {
  const auth = new GoogleAuth(loadGrant(config.google, GOOGLE_ENV.refreshToken.name));
  auth.assertScopes(GOOGLE_SCOPES.gmail, GMAIL_SOURCE);
  return new GmailRest(auth, fetch, config.settings.mailbox.recovery);
}

async function serve(config: GmailConfig): Promise<number> {
  const app = await NestFactory.create(
    AppModule.register({ config, mailbox: mailboxOf(config), watch: true }),
  );
  app.enableShutdownHooks();
  await app.listen(config.port);
  const logger = new Logger('Gmail');
  logger.log(`gmail listening on http://localhost:${config.port}/health`);
  for (const [kind, source] of Object.entries(config.settings.sources))
    logger.log(`${kind}: ${source}`);
  logger.log(
    `loop ${config.loopUrl} · bus ${config.notificationsUrl} · peers ${config.peerUrls.join(', ') || 'none'}`,
  );
  // The service runs until the process is told to stop; the promise never settles on its own.
  return new Promise<number>(() => undefined);
}

async function consent(config: GmailConfig, io: CliIo): Promise<number> {
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
  let config: GmailConfig;
  try {
    config = gmailConfigFromEnv(readSettings(PACKAGE_ROOT));
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
          'gmail',
          async () => {
            // One mission beside the served process: the inbox is its to watch, not this one's.
            const app = await NestFactory.createApplicationContext(
              AppModule.register({ config, mailbox: mailboxOf(config), watch: false }),
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
    if (error instanceof GmailConfigError) {
      io.err(error.message);
      return EXIT.usage;
    }
    throw error;
  }
}
