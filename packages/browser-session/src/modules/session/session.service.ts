import { Inject, Injectable, Logger } from '@nestjs/common';
import { LoopClient } from '@sysdesign/loop-client';
import {
  excerpt,
  type BrowserSessionDetailDto,
  type BrowserSessionDto,
} from '@sysdesign/contracts';

import { SESSION_ENV, type SessionConfig } from '../../config';
import type { RunSessionOptions } from '../../core/engine-context';
import { pauseQuestion } from '../../core/operator-interaction';
import type {
  BrainPort,
  BrowserPort,
  Clock,
  DumpStore,
  GoalSource,
  LedgerPort,
  OperatorPort,
  StopSignal,
} from '../../core/ports';
import { runSession, type SessionOutcome } from '../../core/session-engine';
import { sessionEventsOf, type SessionEventsPort } from '../../core/session-events';
import { SessionRefused, type ConfiguredAdvisor } from '../../core/unit-advice';
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
  UNIT_ADVISORS,
} from './tokens';
import { teachAgain, type TeachAgainReport } from './teach-again';

/**
 * What the command line asks of a run: the engine's options, the subject
 * falling back to the configured one, and what to image and where the
 * settings came from taken from the settings files.
 */
export type RunOptions = Omit<
  RunSessionOptions,
  | 'subject'
  | 'subjectDeclared'
  | 'eventsDrainMs'
  | 'capture'
  | 'settingsSources'
  | 'questionExpiresAfterMs'
  | 'asksAfterRefusal'
  | 'answering'
> & {
  subject?: string | undefined;
};

/**
 * The five things the command line asks for. `run` is the engine over the
 * bound ports; `login` opens the profile headed at a URL and waits for the
 * operator, so the cookies persist for later sessions; `list` and `show`
 * read the ledger; `replayEvents` publishes a recorded session's events
 * again. Progress goes to the operator's terminal, so a session can be
 * watched with the Nest logger quiet; a write that did not land is a warning.
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
    @Inject(UNIT_ADVISORS) private readonly advisors: readonly ConfiguredAdvisor[],
    @Inject(SESSION_EVENTS) private readonly events: SessionEventsPort,
    @Inject(STOP_SIGNAL) private readonly stop: StopSignal,
    @Inject(SESSION_CONFIG) private readonly config: SessionConfig,
    private readonly client: LoopClient,
  ) {}

  run(options: RunOptions): Promise<SessionOutcome> {
    const { capture, operator, session, answering, sources } = this.config.settings;
    // A configuration read once at boot is invisible afterwards: say which files are in force.
    this.operator.notify(
      `settings: ${Object.entries(sources)
        .map(([kind, source]) => `${kind} ${source}`)
        .join(' · ')}`,
    );
    return runSession(
      {
        browser: this.browser,
        brain: this.brain,
        ledger: this.ledger,
        operator: this.operator,
        goals: this.goals,
        clock: this.clock,
        dumps: this.dumps,
        advisors: this.advisors,
        events: this.events,
        stop: this.stop,
        warn: (text) => this.logger.warn(text),
        log: (text) => this.operator.notify(text),
      },
      {
        ...options,
        subject: options.subject ?? this.config.subject,
        // Given by the flag, or set in the environment: anything but the declared fallback.
        subjectDeclared:
          options.subject !== undefined || this.config.subject !== SESSION_ENV.subject.fallback,
        eventsDrainMs: session.busRecovery.windowMs,
        capture,
        questionExpiresAfterMs: operator.expiresAfterMs,
        asksAfterRefusal: operator.asksAfterRefusal,
        answering,
        settingsSources: sources,
      },
    );
  }

  /** Open the profile headed at the URL; the operator signs in and presses Enter; the profile keeps the cookies. */
  async login(profile: string, url: string): Promise<void> {
    await this.browser.open(profile, { headed: true });
    try {
      await this.browser.act({
        kind: 'navigate',
        url,
        reason: 'sign in',
        expect: null,
        serves: [],
      });
      await this.operator.ask(
        pauseQuestion(
          `Sign in at ${url} in the browser window, then continue. The profile "${profile}" keeps the cookies for later sessions.`,
          {
            origin: { kind: 'browser-session', id: excerpt(profile, 80), label: 'sign-in' },
            expiresAt: new Date(
              this.clock.now().getTime() + this.config.settings.operator.expiresAfterMs,
            ),
          },
        ),
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

  /**
   * A recorded session's events published again, from its rows, for a record
   * that missed them; how many went out, or null for a session nobody has.
   * A session from before subjects were kept has no record to belong to.
   */
  async replayEvents(id: string): Promise<number | null> {
    const detail = await this.ledger.getSession(id);
    if (detail === null) return null;
    const { subject } = detail;
    if (subject === null) {
      throw new SessionRefused(
        `session ${id} ran before subjects were kept: its units have no record to belong to`,
      );
    }
    const events = sessionEventsOf({ ...detail, subject });
    for (const event of events) await this.events.publish(event);
    return events.length;
  }

  /**
   * The operator answers a folder of session dumps recorded, taught again in
   * the canonical shape and their earlier digests retracted; `dryRun` plans and
   * posts nothing. The subject is each dump's own, else the configured one.
   */
  teachAgain(dumpsDir: string, dryRun: boolean): Promise<TeachAgainReport> {
    return teachAgain(
      {
        client: this.client,
        ledger: this.ledger,
        subject: this.config.subject,
        log: (text) => this.operator.notify(text),
      },
      dumpsDir,
      dryRun,
    );
  }
}
