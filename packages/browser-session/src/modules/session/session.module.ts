import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnModuleDestroy,
} from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { BrowserDecision, BrowserSession, BrowserTask } from '@sysdesign/db';
import { HttpLoopClient, LoopClient } from '@sysdesign/loop-client';
import { HttpBusClient, InteractionClient } from '@sysdesign/notifications-client';

import { FsGoalSource } from '../../adapters/fs-goal/fs-goal-source';
import { LoopBrain } from '../../adapters/loop-http/loop-brain';
import { MikroOrmLedger } from '../../adapters/mikro-orm/mikro-orm-ledger';
import {
  NotificationsOperator,
  SESSION_SOURCE,
} from '../../adapters/notifications-http/notifications-operator';
import { CHROME_CHANNEL, PlaywrightBrowser } from '../../adapters/playwright/playwright-browser';
import { TerminalOperator } from '../../adapters/terminal-operator/terminal-operator';
import type { SessionConfig } from '../../config';
import { FirstAnswer } from '../../core/first-answer';
import type { Clock, OperatorChannel } from '../../core/ports';
import { fsDumpStore } from '../../core/session-dump';
import { SessionService } from './session.service';
import {
  BRAIN,
  BROWSER,
  CLOCK,
  DUMP_STORE,
  GOAL_SOURCE,
  LEDGER,
  OPERATOR,
  SESSION_CONFIG,
  TERMINAL,
} from './tokens';

const systemClock: Clock = { now: () => new Date() };

/** The channels the operator settings add beside the terminal, each built from its own settings. */
function remoteOperators(config: SessionConfig): OperatorChannel[] {
  const { notifications } = config.settings.operator.channels;
  if (notifications === undefined) return [];
  const bus = new HttpBusClient(config.notificationsUrl, { recovery: notifications.recovery });
  const interactions = new InteractionClient(bus, {
    source: SESSION_SOURCE,
    pullWaitMs: notifications.pullWaitMs,
    eventsPerPull: notifications.eventsPerPull,
  });
  return [new NotificationsOperator(interactions, bus)];
}

/** The terminal's reader released at shutdown, so the process ends as it would without one. */
@Injectable()
class TerminalLifecycle implements OnModuleDestroy {
  constructor(@Inject(TERMINAL) private readonly terminal: TerminalOperator) {}

  onModuleDestroy(): void {
    this.terminal.close();
  }
}

/**
 * The composition root: every port bound to its adapter, the configuration
 * taken as data rather than read here. The scripted end-to-end run keeps
 * this module and overrides the browser, the operator and the loop client
 * by token, so what it exercises is the wiring that ships.
 */
@Module({})
export class SessionModule {
  static register(config: SessionConfig): DynamicModule {
    return {
      module: SessionModule,
      imports: [MikroOrmModule.forFeature([BrowserSession, BrowserTask, BrowserDecision])],
      providers: [
        { provide: SESSION_CONFIG, useValue: config },
        {
          provide: LoopClient,
          useFactory: () =>
            new HttpLoopClient(config.loopUrl, fetch, config.settings.session.loopRecovery),
        },
        {
          provide: BRAIN,
          useFactory: (client: LoopClient) => new LoopBrain(client),
          inject: [LoopClient],
        },
        {
          provide: BROWSER,
          useFactory: () =>
            new PlaywrightBrowser({ profilesDir: config.profilesDir, channel: CHROME_CHANNEL }),
        },
        { provide: LEDGER, useClass: MikroOrmLedger },
        { provide: TERMINAL, useFactory: () => new TerminalOperator() },
        {
          provide: OPERATOR,
          useFactory: (terminal: TerminalOperator) =>
            new FirstAnswer(terminal, remoteOperators(config)),
          inject: [TERMINAL],
        },
        TerminalLifecycle,
        { provide: GOAL_SOURCE, useClass: FsGoalSource },
        { provide: CLOCK, useValue: systemClock },
        { provide: DUMP_STORE, useFactory: () => fsDumpStore(config.dumpDir) },
        SessionService,
      ],
      exports: [SessionService],
    };
  }
}
