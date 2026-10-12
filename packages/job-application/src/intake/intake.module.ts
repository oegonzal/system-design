import {
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpBusClient, type BusClient } from '@sysdesign/notifications-client';

import { SessionRecord } from '../applications';
import { SessionIntake } from './session-events.consumer';
import { INTAKE_SETTINGS, type IntakeSettings } from './settings';

/** The bus the record is fed from; a spec puts its own here. */
export const BUS = Symbol('BUS');

const logger = new Logger('Intake');

/** The intake started once every module is up, and stopped — its pull released — before the store closes. */
@Injectable()
class IntakeLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(private readonly intake: SessionIntake) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.intake.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.intake.stop();
  }
}

/** The record fed from the bus: one subscriber over one bus client. */
@Module({})
export class IntakeModule {
  static register(settings: IntakeSettings, notificationsUrl: string): DynamicModule {
    return {
      module: IntakeModule,
      providers: [
        { provide: INTAKE_SETTINGS, useValue: settings },
        {
          provide: BUS,
          useFactory: () => new HttpBusClient(notificationsUrl, { recovery: settings.busRecovery }),
        },
        {
          provide: SessionIntake,
          useFactory: (bus: BusClient, record: SessionRecord) =>
            new SessionIntake(bus, record, settings, {
              log: (message) => logger.log(message),
              warn: (message) => logger.warn(message),
            }),
          inject: [BUS, SessionRecord],
        },
        IntakeLifecycle,
      ],
    };
  }
}
