import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MemoryClient } from '@sysdesign/agentic-memory-client';
import {
  excerpt,
  type BrowserSessionDetailDto,
  type BrowserSessionDto,
} from '@sysdesign/contracts';
import { LoopClient } from '@sysdesign/loop-client';

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
  SuppliedDocument,
} from '../../core/ports';
import { runSession, type SessionOutcome } from '../../core/session-engine';
import { sessionEventsOf, type SessionEventsPort } from '../../core/session-events';
import { SessionRefused, type ConfiguredAdvisor } from '../../core/unit-advice';
import {
  BRAIN,
  BRAIN_FOR_TENANT,
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
  type BrainForTenant,
} from './tokens';
import { replayFields, type ReplayFieldsOptions, type ReplayFieldsReport } from './replay-fields';
import { subjectFor, teachAgain, type TeachAgainReport } from './teach-again';

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
  | 'untaught'
  | 'answering'
  | 'documents'
> & {
  subject?: string | undefined;
  /** The files for the documents the mission declares, by name; none unless the command line names them. */
  documents?: readonly SuppliedDocument[] | undefined;
};

/**
 * What the command line asks for. `run` is the engine over the bound ports;
 * `login` opens the profile headed at a URL and waits for the operator, so
 * the cookies persist for later sessions; `list` and `show` read the ledger;
 * `replayEvents` publishes a recorded session's events again; `teachAgain`
 * teaches recorded answers again through the brain; `replayFields` replays
 * recorded form pages against the memory. Progress goes to the operator's
 * terminal, so a session can be watched with the Nest logger quiet; a write
 * that did not land is a warning.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('BrowserSession');

  constructor(
    @Inject(BROWSER) private readonly browser: BrowserPort,
    @Inject(BRAIN) private readonly brain: BrainPort,
    @Inject(BRAIN_FOR_TENANT) private readonly brainFor: BrainForTenant,
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
    /** Bound only under a memory brain; a replay asked without one says so. */
    @Optional() @Inject(MemoryClient) private readonly memory: MemoryClient | null = null,
  ) {}

  run(options: RunOptions): Promise<SessionOutcome> {
    const { capture, operator, session, answering, sources } = this.config.settings;
    // A configuration read once at boot is invisible afterwards: say which files are in force.
    this.operator.notify(
      `settings: ${Object.entries(sources)
        .map(([kind, source]) => `${kind} ${source}`)
        .join(' · ')}`,
    );
    this.operator.notify(
      operator.untaught.length === 0
        ? 'teaching: every operator answer is taught to the memory'
        : `teaching: answers given via ${operator.untaught.join(', ')} are kept for this session alone; every other channel's are taught`,
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
        documents: options.documents ?? [],
        subject: options.subject ?? this.config.subject,
        // Given by the flag, or set in the environment: anything but the declared fallback.
        subjectDeclared:
          options.subject !== undefined || this.config.subject !== SESSION_ENV.subject.fallback,
        eventsDrainMs: session.busRecovery.windowMs,
        capture,
        questionExpiresAfterMs: operator.expiresAfterMs,
        asksAfterRefusal: operator.asksAfterRefusal,
        untaught: operator.untaught,
        answering,
        settingsSources: sources,
      },
    );
  }

  /** Open the profile headed at the URL; the operator signs in and presses Enter; the profile keeps the cookies. */
  async login(profile: string, url: string): Promise<void> {
    await this.browser.open(profile, { headed: true, documents: [] });
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
   * the canonical shape through the brain — the environment's tenant's, or
   * the one named — and, for a brain that digests them on the loop, their
   * earlier digests retracted; `dryRun` plans and posts nothing, so binds
   * nothing either. The subject is each dump's own, else the one given, else
   * the configured one — and never the environment's placeholder.
   */
  async teachAgain(
    dumpsDir: string,
    dryRun: boolean,
    subject?: string,
    tenant?: string,
  ): Promise<TeachAgainReport> {
    const brain = tenant === undefined ? this.brain : this.brainFor(tenant);
    if (!dryRun) await brain.bind();
    return teachAgain(
      {
        brain,
        loop: this.client,
        ledger: this.ledger,
        subject: subjectFor(subject, this.config.subject),
        untaught: this.config.settings.operator.untaught,
        log: (text) => this.operator.notify(text),
      },
      dumpsDir,
      dryRun,
    );
  }

  /**
   * The form pages a folder of session dumps recorded, replayed against the
   * memory the brain settings bind: what the recall finds now beside what the
   * recorded goal cited and, when asked, a judged sample routed by the shipped
   * answering settings — written where the options say. Progress goes to the
   * operator's terminal as a run's does.
   */
  replayFields(options: ReplayFieldsOptions): Promise<ReplayFieldsReport> {
    return replayFields(
      {
        loop: this.client,
        memory: this.memory,
        brainSettings: this.config.settings.brain,
        answering: this.config.settings.answering,
        memoryTenant: this.config.memoryTenant,
        clock: this.clock,
        log: (text) => this.operator.notify(text),
      },
      options,
    );
  }
}
