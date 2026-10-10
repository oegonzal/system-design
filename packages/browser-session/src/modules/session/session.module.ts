import { Module, type DynamicModule } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { BrowserDecision, BrowserSession, BrowserTask } from '@sysdesign/db';
import { HttpLoopClient, LoopClient } from '@sysdesign/loop-client';

import { FsGoalSource } from '../../adapters/fs-goal/fs-goal-source';
import { LoopBrain } from '../../adapters/loop-http/loop-brain';
import { MikroOrmLedger } from '../../adapters/mikro-orm/mikro-orm-ledger';
import { CHROME_CHANNEL, PlaywrightBrowser } from '../../adapters/playwright/playwright-browser';
import { TerminalOperator } from '../../adapters/terminal-operator/terminal-operator';
import type { SessionConfig } from '../../config';
import type { Clock } from '../../core/ports';
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
} from './tokens';

const systemClock: Clock = { now: () => new Date() };

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
        { provide: OPERATOR, useFactory: () => new TerminalOperator() },
        { provide: GOAL_SOURCE, useClass: FsGoalSource },
        { provide: CLOCK, useValue: systemClock },
        { provide: DUMP_STORE, useFactory: () => fsDumpStore(config.dumpDir) },
        SessionService,
      ],
      exports: [SessionService],
    };
  }
}
