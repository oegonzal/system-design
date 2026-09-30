import type { ArtifactLocation, SuccessCriterion } from '@sysdesign/contracts';
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

  readonly output: OutputShape<T>;
}

/** The task contract for one run: the spec plus the goal and its derived criteria. */
export interface TaskContract<T> extends TaskSpec<T> {
  readonly goal: string;
  readonly criteria: readonly SuccessCriterion[];
}
