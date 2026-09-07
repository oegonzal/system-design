import type { ArtifactLocation, SuccessCriterion } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

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
