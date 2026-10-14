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

import { HttpUnitAdvisor } from '../../adapters/advisor-http/http-unit-advisor';
import { FsGoalSource } from '../../adapters/fs-goal/fs-goal-source';
import { LoopBrain } from '../../adapters/loop-http/loop-brain';
import { MikroOrmLedger } from '../../adapters/mikro-orm/mikro-orm-ledger';
import { BusSessionEvents } from '../../adapters/notifications-http/bus-session-events';
import {
  NotificationsOperator,
  SESSION_SOURCE,
} from '../../adapters/notifications-http/notifications-operator';
import { CHROME_CHANNEL, PlaywrightBrowser } from '../../adapters/playwright/playwright-browser';
import { TerminalOperator } from '../../adapters/terminal-operator/terminal-operator';
import type { SessionConfig } from '../../config';
import { FirstAnswer } from '../../core/first-answer';
import type { Clock, OperatorChannel, StopSignal } from '../../core/ports';
import { fsDumpStore } from '../../core/session-dump';
import type { ConfiguredAdvisor } from '../../core/unit-advice';
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
  SESSION_EVENTS,
  STOP_SIGNAL,
  TERMINAL,
  UNIT_ADVISORS,
} from './tokens';

/** The longest delay a timer takes; a later time is reached by re-arming. */
const MAX_TIMER_MS = 2_147_483_647;

const systemClock: Clock = {
  now: () => new Date(),
  at: (when, then) => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      const left = when.getTime() - Date.now();
      timer = setTimeout(
        left > MAX_TIMER_MS ? arm : then,
        Math.min(Math.max(0, left), MAX_TIMER_MS),
      );
    };
    arm();
    return () => clearTimeout(timer);
  },
};

/**
 * Ctrl-C, or a termination, as the operator's word. The first hands the
 * engine its stop, and the session ends after the step in flight through
 * every closing write; a second exits at once, as the process would with no
 * handler. The exit code is the shell's for an interrupt. The browser adapter
 * leaves these signals to the engine (`launchOptions`), or Playwright's own
 * handler would exit the process before the close.
 */
const INTERRUPTED_EXIT_CODE = 130;
const STOP_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
const processStopSignal: StopSignal = {
  onStop(handler) {
    let presses = 0;
    const listener = (): void => {
      presses += 1;
      if (presses > 1) process.exit(INTERRUPTED_EXIT_CODE);
      handler();
    };
    for (const signal of STOP_SIGNALS) process.on(signal, listener);
    return () => {
      for (const signal of STOP_SIGNALS) process.off(signal, listener);
    };
  },
};

/** Every advisor the environment lists, by its entry; the mission names which are asked. */
const configuredAdvisors = (config: SessionConfig): ConfiguredAdvisor[] =>
  config.advisors.map((entry) => ({
    id: entry.id,
    where: entry.text,
    port: new HttpUnitAdvisor(entry.url, { recovery: config.settings.session.advisorRecovery }),
  }));

/** The channels the operator settings add beside the terminal, over the one bus client the session has. */
function remoteOperators(config: SessionConfig, bus: HttpBusClient): OperatorChannel[] {
  const { notifications } = config.settings.operator.channels;
  if (notifications === undefined) return [];
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
 * this module and overrides the browser, the operator, the loop client, the
 * events and the stop signal by token, so what it exercises is the wiring
 * that ships.
 */
@Module({})
export class SessionModule {
  static register(config: SessionConfig): DynamicModule {
    // One bus client, whatever the session says on it — a question, an event —
    // riding out a restart within the one declared window.
    const bus = new HttpBusClient(config.notificationsUrl, {
      recovery: config.settings.session.busRecovery,
    });
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
            new FirstAnswer(terminal, remoteOperators(config, bus)),
          inject: [TERMINAL],
        },
        TerminalLifecycle,
        { provide: GOAL_SOURCE, useClass: FsGoalSource },
        { provide: CLOCK, useValue: systemClock },
        { provide: DUMP_STORE, useFactory: () => fsDumpStore(config.dumpDir) },
        { provide: UNIT_ADVISORS, useFactory: () => configuredAdvisors(config) },
        { provide: SESSION_EVENTS, useFactory: () => new BusSessionEvents(bus) },
        { provide: STOP_SIGNAL, useValue: processStopSignal },
        SessionService,
      ],
      exports: [SessionService],
    };
  }
}
