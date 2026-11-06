import { createHash } from 'node:crypto';

import {
  actionRefs,
  elementByRef,
  INTERRUPTED,
  INTERRUPTED_STATUS,
  interruptedDetail,
  readReply,
  type BrowserDecisionDto,
  type BrowserSessionDetailDto,
  type BrowserSessionDto,
  type BrowserTaskDto,
  type InteractionAnswer,
  type LandmarkRole,
  type PageObservation,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import type { DumpBytes, DumpFile } from '@sysdesign/run-dump';

import {
  causeOf,
  ActionFailed,
  type BrowserAction,
  type BrowserPort,
  type DumpSink,
  type DumpStore,
  type GoalSource,
  type LedgerPort,
  type NewDecision,
  type NewSession,
  type NewTask,
  type OperatorPort,
  type OperatorQuestion,
  QuestionWithdrawn,
  type SessionClose,
  type PagesClosed,
  type SuppliedDocument,
  type TaskClose,
  type Withdrawal,
} from './ports';

export * from './testing-runs';
export * from './testing-journey';
export * from './testing-advisor';

/**
 * The ports as fakes, for the engine's specs and the scripted end-to-end
 * run. Every fake records what it was asked and answers from a script; none
 * imports vitest, so the Nest spec can use them too.
 */

/** One page the fake browser shows, and which page each action leads to. */
export interface ScriptedPage {
  id: string;
  observation: PageObservation;
  /** Action key (`click e3`, `navigate https://…`, `press Enter`) → the page shown after it, in the same page. */
  transitions?: Record<string, string>;
  /** Action key → the page shown on a new page over this one, as a link that opens a tab does; `closeOpenedPages` closes it. */
  opens?: Record<string, string>;
  /** What the page states under each landmark, node by node, as a browser reads it from the tree; a landmark not listed says nothing. */
  states?: Partial<Record<LandmarkRole, readonly string[]>>;
}

/** The key a transition is declared under: the action's kind and its target, never its value. */
/** A browser whose page refuses every action of one kind on one page: the element is gone by the time it is acted on. */
export function refusing(
  browser: FakeBrowser,
  kind: BrowserAction['kind'],
  pageId: string,
): FakeBrowser {
  const act = browser.act.bind(browser);
  browser.act = async (action) => {
    if (action.kind === kind && browser.pageId === pageId) {
      throw new ActionFailed(actionKey(action), 'the element is detached');
    }
    return act(action);
  };
  return browser;
}

export function actionKey(action: BrowserAction): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate ${action.url}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}`;
    case 'waitFor':
      return `waitFor ${action.until} ${action.value}`;
    default:
      return `${action.kind} ${action.ref}`;
  }
}

export class FakeBrowser implements BrowserPort {
  readonly calls: string[] = [];
  /** What each screenshot was asked to mark, in order — apart from `calls`, which the step specs pin. */
  readonly shots: (string | null)[] = [];
  readonly values = new Map<string, string>();
  /** What each typed control's list offers when opened, by ref: what `readChoices` reads. */
  readonly choices = new Map<string, readonly string[]>();
  opened: { profile: string; headed: boolean; documents: readonly SuppliedDocument[] } | null =
    null;
  closed = false;
  /** The pages open, oldest first: the one the browser opened with, then each a page opened over it. */
  private stack: ScriptedPage[];
  /** How many pages are kept by `closeOpenedPages`: the one the browser opened with. */
  private readonly keptDepth = 1;
  private observed = new Set<string>();
  /** The page the last `observe` read: what `wordsUnder` answers from, as the real browser answers from its last tree. */
  private lastObserved: ScriptedPage | null = null;

  constructor(private readonly pages: readonly ScriptedPage[]) {
    const [first] = pages;
    if (first === undefined) throw new Error('a fake browser needs at least one page');
    this.stack = [first];
  }

  get pageId(): string {
    return this.current.id;
  }

  /** The page in front: the newest. */
  private get current(): ScriptedPage {
    const top = this.stack[this.stack.length - 1];
    if (top === undefined) throw new Error('the fake browser has no page open');
    return top;
  }

  async open(
    profile: string,
    options: { headed: boolean; documents: readonly SuppliedDocument[] },
  ): Promise<void> {
    this.opened = { profile, headed: options.headed, documents: options.documents };
    this.calls.push(`open ${profile} ${options.headed ? 'headed' : 'headless'}`);
  }

  async observe(): Promise<PageObservation> {
    this.calls.push(`observe ${this.current.id}`);
    this.observed = new Set(this.current.observation.elements.map((element) => element.ref));
    this.lastObserved = this.current;
    return structuredClone(this.current.observation);
  }

  wordsUnder(landmark: LandmarkRole): readonly string[] {
    return this.lastObserved?.states?.[landmark] ?? [];
  }

  async act(action: BrowserAction): Promise<void> {
    const key = actionKey(action);
    this.calls.push(key);
    for (const ref of actionRefs(action)) {
      if (!this.observed.has(ref)) {
        throw new ActionFailed(key, `${ref} is not an element of the last observation`);
      }
    }
    if (action.kind === 'fill') this.values.set(action.ref, action.value);
    if (action.kind === 'select') this.values.set(action.ref, action.option);
    if (action.kind === 'upload') this.values.set(action.ref, action.document);
    const over = this.current.opens?.[key];
    if (over !== undefined) {
      this.stack.push(this.pageOf(over));
      this.values.clear();
      return;
    }
    const next = this.current.transitions?.[key];
    if (next !== undefined) this.show(next);
  }

  /** Jump to a page, as a site would after something the script did not model. */
  show(pageId: string): void {
    this.stack[this.stack.length - 1] = this.pageOf(pageId);
    this.values.clear();
  }

  private pageOf(pageId: string): ScriptedPage {
    const page = this.pages.find((candidate) => candidate.id === pageId);
    if (page === undefined) throw new Error(`the fake browser has no page ${pageId}`);
    return page;
  }

  async closeOpenedPages(): Promise<PagesClosed> {
    const closed = Math.max(0, this.stack.length - this.keptDepth);
    this.stack.length = this.keptDepth;
    this.calls.push(`closeOpenedPages ${closed}`);
    if (closed > 0) this.observed.clear();
    return { closed, front: this.current.observation.url };
  }

  async highlight(ref: string): Promise<void> {
    this.calls.push(`highlight ${ref}`);
  }

  async readValue(ref: string): Promise<string | null> {
    const typed = this.values.get(ref);
    if (typed !== undefined) return typed;
    return elementByRef(this.current.observation.elements, ref)?.value ?? null;
  }

  async readChoices(ref: string): Promise<readonly string[] | null> {
    this.calls.push(`readChoices ${ref}`);
    return this.choices.get(ref) ?? null;
  }

  async screenshot(outline: string | null): Promise<Uint8Array> {
    this.shots.push(outline);
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.calls.push('close');
  }
}

type StoredSession = BrowserSessionDto & {
  goalMarkdown: string;
  criteria: Record<string, SuccessCriterion[]> | null;
};

/** The records in memory, as DTOs; `failing` makes every write reject, for the queue's reporting. */
export class InMemoryLedger implements LedgerPort {
  readonly sessions = new Map<string, StoredSession>();
  readonly tasks = new Map<string, BrowserTaskDto>();
  readonly decisions: BrowserDecisionDto[] = [];
  readonly heartbeats: { at: string; steps: number }[] = [];
  readonly teachings: { decisionIds: string[]; ref: string }[] = [];
  failing: Error | null = null;

  private async write<T>(work: () => T): Promise<T> {
    if (this.failing) throw this.failing;
    return work();
  }

  openSession(session: NewSession): Promise<void> {
    return this.write(() => {
      const { startedAt, ...rest } = session;
      this.sessions.set(session.id, {
        ...rest,
        status: 'running',
        terminationReason: null,
        terminationCause: null,
        terminationDetail: null,
        criteria: null,
        steps: 0,
        startedAt: startedAt.toISOString(),
        heartbeatAt: startedAt.toISOString(),
        finishedAt: null,
        error: null,
      });
    });
  }

  recordCriteria(sessionId: string, criteria: Record<string, SuccessCriterion[]>): Promise<void> {
    return this.write(() => {
      this.require(sessionId).criteria = criteria;
    });
  }

  heartbeat(sessionId: string, at: Date, steps: number): Promise<void> {
    return this.write(() => {
      const session = this.require(sessionId);
      session.heartbeatAt = at.toISOString();
      session.steps = steps;
      this.heartbeats.push({ at: at.toISOString(), steps });
    });
  }

  openTask(task: NewTask): Promise<void> {
    return this.write(() => {
      const { startedAt, facets, ...rest } = task;
      this.tasks.set(task.id, {
        ...rest,
        facets: [...facets],
        status: 'open',
        outcome: null,
        endStep: null,
        startedAt: startedAt.toISOString(),
        finishedAt: null,
      });
    });
  }

  closeTask(taskId: string, close: TaskClose): Promise<void> {
    return this.write(() => {
      const task = this.tasks.get(taskId);
      if (task === undefined) throw new Error(`no task ${taskId}`);
      Object.assign(task, {
        status: close.status,
        outcome: close.outcome,
        endStep: close.endStep,
        finishedAt: close.finishedAt.toISOString(),
      });
    });
  }

  recordDecision(decision: NewDecision): Promise<void> {
    return this.write(() => {
      const { createdAt, ...rest } = decision;
      this.decisions.push({
        ...rest,
        teachingRef: null,
        createdAt: createdAt.toISOString(),
      });
    });
  }

  recordTeaching(decisionIds: readonly string[], ref: string): Promise<void> {
    return this.write(() => {
      this.teachings.push({ decisionIds: [...decisionIds], ref });
      for (const decision of this.decisions) {
        if (decisionIds.includes(decision.id)) decision.teachingRef = ref;
      }
    });
  }

  closeSession(sessionId: string, close: SessionClose): Promise<void> {
    return this.write(() => {
      const session = this.require(sessionId);
      Object.assign(session, {
        status: close.status,
        terminationReason: close.termination.reason,
        terminationCause: causeOf(close.termination),
        terminationDetail: close.termination.detail,
        steps: close.steps,
        finishedAt: close.finishedAt.toISOString(),
        heartbeatAt: close.finishedAt.toISOString(),
        error: close.error,
      });
    });
  }

  failStale(before: Date): Promise<number> {
    return this.write(() => {
      const stale = [...this.sessions.values()].filter(
        (session) =>
          session.status === 'running' && Date.parse(session.heartbeatAt) < before.getTime(),
      );
      for (const session of stale) {
        Object.assign(session, {
          status: INTERRUPTED_STATUS,
          terminationReason: INTERRUPTED,
          terminationDetail: interruptedDetail(session.heartbeatAt),
          finishedAt: session.heartbeatAt,
        });
      }
      return stale.length;
    });
  }

  async listSessions(limit: number): Promise<BrowserSessionDto[]> {
    return [...this.sessions.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map(({ goalMarkdown: _goal, criteria: _criteria, ...dto }) => dto);
  }

  async getSession(id: string): Promise<BrowserSessionDetailDto | null> {
    const session = this.sessions.get(id);
    if (session === undefined) return null;
    const { goalMarkdown: _goal, criteria: _criteria, ...dto } = session;
    return {
      ...dto,
      tasks: [...this.tasks.values()]
        .filter((task) => task.sessionId === id)
        .sort((a, b) => a.ordinal - b.ordinal),
      decisions: this.decisions
        .filter((decision) => decision.sessionId === id)
        .sort((a, b) => a.step - b.step || a.ordinal - b.ordinal),
    };
  }

  private require(sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new Error(`no session ${sessionId}`);
    return session;
  }
}

/**
 * An operator who types from a script, as a person would at the terminal:
 * each line read the one declared way, an empty one as the question's Enter.
 * Past the script a field is left blank, and anything else goes on. A line
 * the question refuses is a spec that typed the wrong thing, and fails it.
 * It answers a turn later, so a question can be withdrawn while it waits.
 */
export class ScriptedOperator implements OperatorPort {
  readonly questions: OperatorQuestion[] = [];
  readonly notices: string[] = [];
  readonly unusedAnswers: Withdrawal[] = [];
  private readonly lines: string[];
  private answered = 0;

  /** Named as the channel its answers carry (`via.channel`), so a spec can stand it for any channel the settings name or not. */
  constructor(
    lines: readonly string[] = [],
    readonly name = 'scripted',
  ) {
    this.lines = [...lines];
  }

  async ask(question: OperatorQuestion, signal?: AbortSignal): Promise<InteractionAnswer> {
    this.questions.push(question);
    await new Promise((resolve) => setImmediate(resolve));
    if (signal?.aborted === true) throw new QuestionWithdrawn(this.name);
    const offers = (id: string): boolean =>
      question.prompt.commands.some((command) => command.id === id);
    const line = this.lines.shift() ?? (offers('blank') ? '/blank' : '');
    const typed = line.trim() === '' && question.enter !== null ? `/${question.enter}` : line;
    const reading = readReply(question.prompt, typed);
    if (reading.kind === 'refused') {
      throw new Error(
        `the script typed ${JSON.stringify(line)}, which the question refuses: ${reading.reason}`,
      );
    }
    this.answered += 1;
    return {
      promptId: question.prompt.id,
      reply: reading.reply,
      via: { channel: this.name, ref: `line-${this.answered}` },
    };
  }

  async unused(_question: OperatorQuestion, withdrawal: Withdrawal): Promise<void> {
    this.unusedAnswers.push(withdrawal);
  }

  notify(text: string): void {
    this.notices.push(text);
  }
}

/** A dump that keeps its files in memory, by path. */
export class InMemoryDumpStore implements DumpStore {
  readonly files = new Map<string, string | Uint8Array>();
  readonly index: string[] = [];
  readonly runId = 'fake-session-dump';
  /** How many sessions opened a folder here: a refused session opens none. */
  opened = 0;

  open(): DumpSink {
    this.opened += 1;
    return {
      runId: this.runId,
      write: (files: readonly (DumpFile | DumpBytes)[]) => {
        for (const file of files) {
          this.files.set(file.path, 'bytes' in file ? file.bytes : file.content);
        }
      },
      index: (row: string) => {
        this.index.push(row);
      },
    };
  }

  text(path: string): string {
    const file = this.files.get(path);
    if (typeof file !== 'string') throw new Error(`no text file ${path} in the fake dump`);
    return file;
  }
}

/** Goals by path, hashed the way the filesystem source hashes them. */
export class InMemoryGoalSource implements GoalSource {
  constructor(private readonly documents: Record<string, string>) {}

  async read(path: string): Promise<{ path: string; markdown: string; hash: string }> {
    const markdown = this.documents[path];
    if (markdown === undefined) throw new Error(`no goal at ${path}`);
    return { path, markdown, hash: createHash('sha256').update(markdown).digest('hex') };
  }
}
