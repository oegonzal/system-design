import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BrowserSessionDetailDto, BrowserSessionDto } from '@sysdesign/contracts';

import type { SessionConfig } from '../../config';
import type { RunSessionOptions } from '../../core/engine-context';
import type {
  BrainPort,
  BrowserPort,
  Clock,
  DumpStore,
  GoalSource,
  LedgerPort,
  OperatorPort,
} from '../../core/ports';
import { runSession, type SessionOutcome } from '../../core/session-engine';
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

/** What the command line asks of a run: the engine's options, the subject falling back to the configured one. */
export type RunOptions = Omit<RunSessionOptions, 'subject'> & { subject?: string | undefined };

/**
 * The four things the command line asks for. `run` is the engine over the
 * bound ports; `login` opens the profile headed at a URL and waits for the
 * operator, so the cookies persist for later sessions; `list` and `show`
 * read the ledger. Progress goes to the operator's terminal, so a session
 * can be watched with the Nest logger quiet; a write that did not land is
 * a warning.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('BrowserSession');

  constructor(
    @Inject(BROWSER) private readonly browser: BrowserPort,
    @Inject(BRAIN) private readonly brain: BrainPort,
    @Inject(LEDGER) private readonly ledger: LedgerPort,
    @Inject(OPERATOR) private readonly operator: OperatorPort,
    @Inject(GOAL_SOURCE) private readonly goals: GoalSource,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DUMP_STORE) private readonly dumps: DumpStore,
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
  ) {}

  run(options: RunOptions): Promise<SessionOutcome> {
    return runSession(
      {
        browser: this.browser,
        brain: this.brain,
        ledger: this.ledger,
        operator: this.operator,
        goals: this.goals,
        clock: this.clock,
        dumps: this.dumps,
        warn: (text) => this.logger.warn(text),
        log: (text) => this.operator.notify(text),
      },
      { ...options, subject: options.subject ?? this.config.subject },
    );
  }

  /** Open the profile headed at the URL; the operator signs in and presses Enter; the profile keeps the cookies. */
  async login(profile: string, url: string): Promise<void> {
    await this.browser.open(profile, { headed: true });
    try {
      await this.browser.act({ kind: 'navigate', url, reason: 'sign in', expect: null });
      await this.operator.pause(
        `Sign in at ${url} in the browser window. The profile "${profile}" keeps the cookies for later sessions.`,
      );
    } finally {
      await this.browser.close();
    }
  }

  list(limit: number): Promise<BrowserSessionDto[]> {
    return this.ledger.listSessions(limit);
  }

  show(id: string): Promise<BrowserSessionDetailDto | null> {
    return this.ledger.getSession(id);
  }
}
