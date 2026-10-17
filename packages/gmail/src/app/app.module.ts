import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { GMAIL_SOURCE } from '@sysdesign/contracts';
import { HealthController } from '@sysdesign/nest-kit';
import { BusClient } from '@sysdesign/notifications-client';
import { BusSessionEvents, ToolCatalog, ToolSessionModule } from '@sysdesign/tool-session';

import type { GmailConfig } from '../config';
import { MAILBOX, type MailboxPort } from '../mailbox';
import type { GmailSettings } from '../settings';
import { gmailTools } from '../tools';
import { InboxWatcher } from '../watch';

export const WATCH_SETTINGS = Symbol('WATCH_SETTINGS');

/** The inbox watcher as the application runs it: started once the app is up, stopped as it goes down. */
@Injectable()
export class InboxWatch implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly watcher: InboxWatcher;

  constructor(
    @Inject(MAILBOX) mailbox: MailboxPort,
    bus: BusClient,
    @Inject(WATCH_SETTINGS) settings: GmailSettings['watch'],
  ) {
    const log = new Logger(InboxWatch.name);
    this.watcher = new InboxWatcher(mailbox, bus, settings, {
      info: (line) => log.log(line),
      warn: (line) => log.warn(line),
    });
  }

  onApplicationBootstrap(): Promise<void> {
    return this.watcher.start();
  }

  onModuleDestroy(): void {
    this.watcher.stop();
  }
}

/**
 * What the application is composed from beyond its config: the mailbox,
 * which `main` fills with Gmail and a spec with memory, and whether this
 * process watches the inbox — the served process does; a mission run from
 * the command line beside it must not, or every arrival would be told twice.
 */
export interface AppModuleOptions {
  config: Omit<GmailConfig, 'google'>;
  mailbox: MailboxPort;
  watch: boolean;
}

/**
 * The composition root: the mailbox behind its port, the tools over it, the
 * sessions the loop decides for them, the watcher, and the health check. The
 * one place that reads the whole config and hands each layer only what it needs.
 */
@Module({})
export class AppModule {
  static register({ config, mailbox, watch }: AppModuleOptions): DynamicModule {
    const log = new Logger('Gmail');
    return {
      module: AppModule,
      imports: [
        ToolSessionModule.register({
          service: GMAIL_SOURCE,
          catalog: (bus) =>
            new ToolCatalog(
              gmailTools(
                mailbox,
                config.settings.mailbox,
                new BusSessionEvents(bus, GMAIL_SOURCE, {
                  info: (line) => log.log(line),
                  warn: (line) => log.warn(line),
                }),
              ),
            ),
          peers: config.peerUrls,
          loopUrl: config.loopUrl,
          notificationsUrl: config.notificationsUrl,
          settings: config.settings.session,
        }),
      ],
      providers: [
        { provide: MAILBOX, useValue: mailbox },
        { provide: WATCH_SETTINGS, useValue: config.settings.watch },
        ...(watch ? [InboxWatch] : []),
      ],
      controllers: [HealthController],
    };
  }
}
