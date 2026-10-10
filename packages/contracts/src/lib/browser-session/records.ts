/**
 * A browser session's records as the session program reports them: the
 * session, its units of work and every decision — each decision naming the
 * quality-loop run or orchestration that made it, so the loop's own records
 * are one id away.
 */
import type { IsoDateString, Uuid } from '../primitives';
import type {
  BrowserDecisionKind,
  BrowserDecisionSource,
  BrowserSessionStatus,
  BrowserSessionTermination,
  BrowserTaskStatus,
  ConfidenceLevel,
  TaskOutcome,
} from './vocab';

/** The engine's own stop rules, declared per session; never a judgement. */
export interface SessionRailsDto {
  /**
   * Units of work to close `done` before the session ends complete — the
   * session's goal, counted on that one outcome; null when none is set. A
   * `done` unit spends the `maxTasks` budget too, so it is never above it.
   */
  targetDone: number | null;
  maxTasks: number;
  maxMinutes: number;
  maxConsecutiveFailures: number;
  /** Brain calls in a row that answered nothing before the session stops; an answered one clears the count. */
  maxBrainFaults: number;
  /** Observations in a row the page could not be read before the session stops. */
  maxUnreadablePages: number;
  /** Observations in a row of a page that did not change before the session stops, whatever the steps did. */
  maxStalledSteps: number;
}

export interface BrowserSessionDto {
  id: Uuid;
  /** The dump folder under the sessions dump dir. */
  dumpRunId: string;
  goalPath: string;
  goalHash: string;
  profile: string;
  headed: boolean;
  status: BrowserSessionStatus;
  terminationReason: BrowserSessionTermination | null;
  /** Which of its mission's stops ended the session, by the mission's cause word; null for any other end. */
  terminationCause: string | null;
  terminationDetail: string | null;
  limits: SessionRailsDto;
  steps: number;
  startedAt: IsoDateString;
  /** The last sign of life from the process running it. */
  heartbeatAt: IsoDateString;
  finishedAt: IsoDateString | null;
  error: { name: string; message: string } | null;
}

export interface BrowserTaskDto {
  id: Uuid;
  sessionId: Uuid;
  ordinal: number;
  label: string;
  /** What the site calls it — a URL or an id — when the plan gave one. */
  externalRef: string | null;
  status: BrowserTaskStatus;
  outcome: TaskOutcome | null;
  startStep: number;
  endStep: number | null;
  startedAt: IsoDateString;
  finishedAt: IsoDateString | null;
}

export interface BrowserDecisionDto {
  id: Uuid;
  sessionId: Uuid;
  taskId: Uuid | null;
  step: number;
  ordinal: number;
  kind: BrowserDecisionKind;
  source: BrowserDecisionSource;
  /** The quality run that decided; not a foreign key — the loop is another service. */
  loopRunId: string | null;
  /** The orchestration that ran the deciding run, when one did. */
  loopOrchestrationId: string | null;
  /** The document-memory orchestration an operator's answer was taught through. */
  teachOrchestrationId: string | null;
  /** The element ref, for a field. */
  ref: string | null;
  /** The field's label — the join key for "was this asked before". */
  question: string | null;
  answer: string | null;
  confidence: ConfidenceLevel | null;
  /** The decision's own shape: a plan's page kind and outcome, a field's route, basis and findings. */
  payload: Record<string, unknown>;
  durationMs: number | null;
  createdAt: IsoDateString;
}

export interface BrowserSessionDetailDto extends BrowserSessionDto {
  tasks: BrowserTaskDto[];
  decisions: BrowserDecisionDto[];
}
