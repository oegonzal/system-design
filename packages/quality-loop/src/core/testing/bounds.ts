/**
 * A pipeline's declarations held to what its stages measurably wrote — the
 * fixture `pnpm measure:bounds` writes beside it (`measured.json`). Pure
 * helpers only — no vitest imports, so this file compiles under the app
 * tsconfig even though only specs use it. Field bounds are held by contracts'
 * `boundsAgainstMeasured`, the one check every declaring module shares.
 */
import type { MeasuredCap } from '@sysdesign/contracts';

import { criterionLengthBound, type TaskSpec } from '../contracts';
import { criteriaSchema, enumTuple } from '../stages/schemas';

/**
 * How far above the most a stage has measurably written its declared cap
 * must sit. A cap is also the call's time limit (`callTimeLimitMs`), so one
 * a stage outwrites is a call cut short; a fifth over the most measured is
 * the room a longer artifact than any recorded yet still finishes in.
 */
export const CAP_HEADROOM = 1.2;

/** The stages of a definition that declare an output cap, as a spec names them. */
interface CappedStages {
  deriveCriteria: { maxTokens: number };
  producer: { maxTokens: number };
  critics: readonly { id: string; maxTokens: number }[];
  evaluators: readonly { id: string; maxTokens: number }[];
}

/** Every declared output cap by stage: `criteria`, `producer`, then each lens by id. */
export const declaredCaps = (definition: CappedStages): Record<string, number> =>
  Object.fromEntries([
    ['criteria', definition.deriveCriteria.maxTokens],
    ['producer', definition.producer.maxTokens],
    ...[...definition.critics, ...definition.evaluators].map(
      (lens) => [lens.id, lens.maxTokens] as const,
    ),
  ]);

export interface CapsCheck {
  /** The share over the most measured a cap must clear. */
  headroom?: number;
  /** Stages this check does not hold, each with why — a supplied rubric's deriver, a pipeline no run has recorded. */
  exempt?: Readonly<Record<string, string>>;
}

/**
 * Every way a definition's caps fall short of its measurement — empty when
 * none does: a cap under `headroom` times the most its stage wrote, a
 * measured stage the definition no longer declares, and a declared stage
 * nothing measured that the spec did not exempt.
 */
export function capsAgainstMeasured(
  definition: CappedStages,
  measured: Readonly<Record<string, MeasuredCap>>,
  check: CapsCheck = {},
): string[] {
  const headroom = check.headroom ?? CAP_HEADROOM;
  const exempt = check.exempt ?? {};
  const caps = declaredCaps(definition);
  const problems: string[] = [];
  for (const [stage, written] of Object.entries(measured)) {
    const cap = caps[stage];
    if (cap === undefined) {
      problems.push(`${stage}: measured, but the definition declares no such stage`);
      continue;
    }
    if (Object.hasOwn(exempt, stage)) continue;
    const needed = Math.ceil(written.max * headroom);
    if (cap < needed) {
      problems.push(`${stage}: cap ${cap} < ${headroom} × measured max ${written.max} (${needed})`);
    }
  }
  for (const stage of Object.keys(caps)) {
    if (Object.hasOwn(measured, stage) || Object.hasOwn(exempt, stage)) continue;
    problems.push(`${stage}: declared, never measured`);
  }
  return problems;
}

/**
 * A pipeline no run has recorded yet holds its caps to seeds — what each
 * stage is expected to write, from a comparable pipeline — in the shape a
 * measurement takes, until `pnpm measure:bounds` has a run to replace them.
 */
export const seededCaps = (seeds: Readonly<Record<string, number>>): Record<string, MeasuredCap> =>
  Object.fromEntries(
    Object.entries(seeds).map(([stage, most]) => [
      stage,
      { n: 0, max: most, p99: most, maxApiCalls: null },
    ]),
  );

/** Every declared stage, exempt for one reason — a pipeline no run has recorded. */
export const allStages = (definition: CappedStages, reason: string): Record<string, string> =>
  Object.fromEntries(Object.keys(declaredCaps(definition)).map((stage) => [stage, reason]));

/** The schema a definition's deriver answers, built as the stage builds it. */
export function deriverSchema<T>(task: TaskSpec<T>) {
  const kinds = enumTuple(Object.keys(task.criterionKinds));
  if (kinds === null) throw new Error('a task with no criterion kinds derives nothing');
  return criteriaSchema(kinds, task.maxCriteria, criterionLengthBound(task));
}
