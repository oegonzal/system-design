import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { GOOGLE_CALENDAR_SOURCE } from '@sysdesign/contracts';
import { HealthController } from '@sysdesign/nest-kit';
import { BusClient } from '@sysdesign/notifications-client';
import { BusSessionEvents, ToolCatalog, ToolSessionModule } from '@sysdesign/tool-session';

import { CALENDAR, type CalendarPort } from '../calendar';
import type { GoogleCalendarConfig } from '../config';
import type { WatchSettings } from '../settings';
import { calendarTools } from '../tools';
import { ChangeWatcher } from '../watch';

export const WATCH_SETTINGS = Symbol('WATCH_SETTINGS');

/** The change watcher as the application runs it: started once the app is up, stopped as it goes down. */
@Injectable()
export class ChangeWatch implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly watcher: ChangeWatcher;

  constructor(
    @Inject(CALENDAR) calendar: CalendarPort,
    bus: BusClient,
    @Inject(WATCH_SETTINGS) settings: WatchSettings,
  ) {
    const log = new Logger(ChangeWatch.name);
    this.watcher = new ChangeWatcher(calendar, bus, settings, {
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

/** What the application is composed from beyond its config: the calendar, which `main` fills with Google's and a spec with memory. */
export interface AppModuleOptions {
  config: Omit<GoogleCalendarConfig, 'google'>;
  calendar: CalendarPort;
}

/**
 * The composition root: the calendar behind its port, the tools over it, the
 * sessions the loop decides for them, the watcher, and the health check. The
 * one place that reads the whole config and hands each layer only what it needs.
 */
@Module({})
export class AppModule {
  static register({ config, calendar }: AppModuleOptions): DynamicModule {
    const log = new Logger('Calendar');
    return {
      module: AppModule,
      imports: [
        ToolSessionModule.register({
          service: GOOGLE_CALENDAR_SOURCE,
          catalog: (bus) =>
            new ToolCatalog(
              calendarTools({
                calendar,
                scheduling: config.settings.scheduling,
                sizes: config.settings.calendar,
                events: new BusSessionEvents(bus, GOOGLE_CALENDAR_SOURCE, {
                  info: (line) => log.log(line),
                  warn: (line) => log.warn(line),
                }),
                clock: () => new Date(),
              }),
            ),
          peers: config.peerUrls,
          loopUrl: config.loopUrl,
          notificationsUrl: config.notificationsUrl,
          settings: config.settings.session,
        }),
      ],
      providers: [
        { provide: CALENDAR, useValue: calendar },
        { provide: WATCH_SETTINGS, useValue: config.settings.watch },
        ChangeWatch,
      ],
      controllers: [HealthController],
    };
  }
}
