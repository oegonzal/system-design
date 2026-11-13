import type {
  BrowserDecisionKind,
  BrowserDecisionSource,
  BrowserSessionDetailDto,
  BrowserSessionDto,
  BrowserSessionStatus,
  EngineTermination,
  BrowserTaskStatus,
  AnswerBasis,
  SessionRailsDto,
  SuccessCriterion,
  TaskOutcome,
  StopEnding,
  UnitFacet,
} from '@sysdesign/contracts';
import { MISSION_STOP } from '@sysdesign/contracts';

/**
 * How a session ended: by a rail, the operator or a fault, each the engine's
 * own word; or by a stop its mission declares — which one, by the mission's
 * cause word, and the status the mission says it leaves the session in.
 */
export type Termination =
  | { reason: EngineTermination; detail: string }
  | { reason: typeof MISSION_STOP; cause: string; ending: StopEnding; detail: string };

/** The mission's cause word when one of its stops ended the session; null for any other end. */
export const causeOf = (termination: Termination): string | null =>
  termination.reason === MISSION_STOP ? termination.cause : null;

export interface NewSession {
  id: string;
  dumpRunId: string;
  goalPath: string;
  goalHash: string;
  goalMarkdown: string;
  profile: string;
  /** Whom the session acts for, by name: the partition every record beyond the session is kept under. */
  subject: string;
  headed: boolean;
  limits: SessionRailsDto;
  startedAt: Date;
}

export interface NewTask {
  id: string;
  sessionId: string;
  ordinal: number;
  label: string;
  externalRef: string | null;
  /** The unit's identity as the plan declared it. */
  facets: readonly UnitFacet[];
  startStep: number;
  startedAt: Date;
}

export interface TaskClose {
  status: BrowserTaskStatus;
  outcome: TaskOutcome;
  endStep: number;
  finishedAt: Date;
}

export interface NewDecision {
  id: string;
  sessionId: string;
  taskId: string | null;
  step: number;
  ordinal: number;
  kind: BrowserDecisionKind;
  source: BrowserDecisionSource;
  loopRunId: string | null;
  loopOrchestrationId: string | null;
  ref: string | null;
  question: string | null;
  answer: string | null;
  /** How a field answer's value rests on the evidence, as declared; null for anything else. */
  rests: AnswerBasis | null;
  payload: Record<string, unknown>;
  durationMs: number | null;
  createdAt: Date;
}

export interface SessionClose {
  status: BrowserSessionStatus;
  termination: Termination;
  steps: number;
  finishedAt: Date;
  error: { name: string; message: string } | null;
}

/**
 * The records. Ids are minted by the engine, so every write can be queued
 * without awaiting the one before it; the adapter never invents one.
 */
export interface LedgerPort {
  openSession(session: NewSession): Promise<void>;
  recordCriteria(sessionId: string, criteria: Record<string, SuccessCriterion[]>): Promise<void>;
  heartbeat(sessionId: string, at: Date, steps: number): Promise<void>;
  openTask(task: NewTask): Promise<void>;
  closeTask(taskId: string, close: TaskClose): Promise<void>;
  recordDecision(decision: NewDecision): Promise<void>;
  /** The reference the teaching left (an orchestration id today, a memory record id under a memory-backed brain), written onto exactly the decision rows whose answers it carried. */
  recordTeaching(decisionIds: readonly string[], ref: string): Promise<void>;
  closeSession(sessionId: string, close: SessionClose): Promise<void>;
  /**
   * Every session still `running` whose beat is older than `before` closed
   * as interrupted, finished at its last beat; how many. A live session beats
   * well inside the window and is never touched; a close that later arrives
   * from a stopped process overwrites the row with what ended it.
   */
  failStale(before: Date): Promise<number>;
  /**
   * The running session on the profile that beat after `after`, by id and
   * last beat, or null: the lease another process holds on the profile. A
   * row that stopped beating earlier holds nothing — the next session closes
   * it as interrupted.
   */
  liveSessionOn(profile: string, after: Date): Promise<{ id: string; heartbeatAt: string } | null>;
  listSessions(limit: number): Promise<BrowserSessionDto[]>;
  getSession(id: string): Promise<BrowserSessionDetailDto | null>;
}
