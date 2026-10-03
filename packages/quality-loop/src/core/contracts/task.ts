import {
  CRITERION_STATEMENT_BOUND,
  keptAtMost,
  type ArtifactLocation,
  type Bound,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import type { ZodType } from 'zod';

/** Enough for any prompt a person would write; a larger goal is clipped and traced. */
export const GOAL_MAX_BYTES = 64_000;

/** How much of the budget a goal spends: bytes, since that is what the model is billed. */
export const goalBytes = (goal: string): number => Buffer.byteLength(goal, 'utf8');

/**
 * The pipeline's code half: how an output is parsed, addressed and shown to a
 * judge. Everything else about a task is data, and every wire type lives in
 * `@sysdesign/contracts` under `quality-loop/`.
 */
export interface OutputShape<T> {
  readonly schema: ZodType<T>;
  /** Engine-assigned, deterministic ids (`component.1`, `flow.2` …). */
  locate(output: T): ArtifactLocation[];
  /** The text every judge reads. Must print every location id verbatim. */
  render(output: T): string;
  /**
   * Optional. A deterministic repair the loop applies to a PRODUCED artifact
   * before any validator runs — never to a provided or adopted one, which are
   * judged exactly as handed in. Total over whatever the model returned: when
   * the value would not parse, return it untouched and let the schema
   * validator report it. Idempotent, so a consumer re-running it on the
   * stored artifact changes nothing — what is judged is what is stored.
   */
  normalize?(output: T, contract: TaskContract<T>): T;
}

export interface TaskSpec<T> {
  /** Kind id → one-line meaning shown to the model. The policy prices kinds; the model only picks one. */
  readonly criterionKinds: Readonly<Record<string, string>>;

  /** Finding type → one-line meaning. The policy maps and gates types; the model only picks one. */
  readonly findingTypes: Readonly<Record<string, string>>;

  readonly maxCriteria: number;

  /**
   * The statement bound the deriver writes within — its target asked for,
   * its ceiling accepted without a word — and so what a supplied rubric may
   * carry (`providedStatementLimit`). The contract's bound unless declared: a
   * pipeline whose record genuinely needs longer statements sizes its own
   * from measured runs.
   */
  readonly statementBound?: Bound;

  readonly output: OutputShape<T>;
}

/** The bound a task holds every criterion statement to: its own, or the contract's. */
export const criterionLengthBound = (task: Pick<TaskSpec<unknown>, 'statementBound'>): Bound =>
  task.statementBound ?? CRITERION_STATEMENT_BOUND;

/**
 * The longest statement a supplied rubric may carry: the longest the task's
 * own deriver can return, which reads its reply leniently and so keeps a
 * statement past the ceiling. One rule for both, so a rubric the deriver
 * returned is always one a caller can hand back; past the target it is an
 * overrun on the record, as a derived one is.
 */
export const providedStatementLimit = (task: Pick<TaskSpec<unknown>, 'statementBound'>): number =>
  keptAtMost(criterionLengthBound(task));

/** The ids of the criteria whose statement runs past what the task accepts — `providedStatementLimit`. */
export const overlongCriteria = (
  criteria: readonly SuccessCriterion[],
  task: Pick<TaskSpec<unknown>, 'statementBound'>,
): string[] =>
  criteria
    .filter((criterion) => criterion.statement.length > providedStatementLimit(task))
    .map((criterion) => criterion.id);

/** The task contract for one run: the spec plus the goal and its derived criteria. */
export interface TaskContract<T> extends TaskSpec<T> {
  readonly goal: string;
  readonly criteria: readonly SuccessCriterion[];
}
