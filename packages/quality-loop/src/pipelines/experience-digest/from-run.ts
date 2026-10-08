/**
 * A finished run → an experience record: the engine's own reduction of the run
 * (`core/outputs/experience-record`) plus what this codec's stages read — the
 * rules that travel with it and how many memories it may propose — fitted to
 * the goal budget this codec's own render measures.
 */
import { GOAL_BUDGET_BYTES } from '@sysdesign/contracts';
import type { QualityRunDto } from '@sysdesign/contracts';

import { experienceOf, fitToBudget, trimExperience } from '../../core/outputs';
import { DIGEST_RULES, MAX_MEMORIES, renderGoal, type ExperienceRecord } from './input';

export interface ComposeOptions {
  maxMemories?: number;
  rules?: readonly string[];
}

/** Fit a record to the goal budget, deterministically, one cheapest trim at a time. */
export const fit = (record: ExperienceRecord, budget = GOAL_BUDGET_BYTES): ExperienceRecord =>
  fitToBudget(record, renderGoal, trimExperience, budget);

/**
 * Null until the run has settled a trace: a run still going (its trace has no
 * stop reason yet) or one that failed before the loop teaches nothing yet.
 */
export function fromRun(run: QualityRunDto, options: ComposeOptions = {}): ExperienceRecord | null {
  const experience = experienceOf(run);
  if (experience === null) return null;
  return fit({
    ...experience,
    rules: [...(options.rules ?? DIGEST_RULES)],
    maxMemories: options.maxMemories ?? MAX_MEMORIES,
  });
}
