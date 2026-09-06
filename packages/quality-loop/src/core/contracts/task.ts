import type { ZodType } from 'zod';

/** An addressable part of an artifact — the only thing a lens may point at. */
export interface Location {
  id: string;
  label: string;
}

/**
 * The pipeline's code half: how an output is parsed, addressed and shown to a
 * judge. Everything else about a task is data.
 */
export interface OutputShape<T> {
  readonly schema: ZodType<T>;
  /** Engine-assigned, deterministic ids (`component.1`, `flow.2` …). */
  locate(output: T): Location[];
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

/** One success criterion, derived from the goal. Ids are engine-assigned (`c1`…). */
export interface Criterion {
  id: string;
  kind: string;
  statement: string;
}

/** The task contract for one run: the spec plus the goal and its derived criteria. */
export interface TaskContract<T> extends TaskSpec<T> {
  readonly goal: string;
  readonly criteria: readonly Criterion[];
}
