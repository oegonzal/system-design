/**
 * The exact checks: what the index says against what the pack cites. A pack
 * that cites what was never recalled, or leaves a candidate unjudged, cannot
 * be trusted by any lens, so both block.
 */
import type { ValidationProblem } from '@sysdesign/contracts';

import {
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  problem,
  REFERENCES_VALIDATOR_ID,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { MEMORY_RECALL_ID, readIndex, type MemoryIndex } from './input';
import type { MemoryPack } from './output';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<MemoryPack, MemoryIndex>;

/** Every candidate the pack gives a verdict, kept or dropped. */
const verdicts = (pack: MemoryPack): string[] => [
  ...pack.kept.map((item) => item.chunk),
  ...pack.dropped.map((item) => item.chunk),
];

const references: Rule = (pack, index) => {
  const known = new Set(index.candidates.map((candidate) => candidate.alias));
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const alias of verdicts(pack)) {
    if (!known.has(alias)) problems.push(problem('critical', `${alias} is not a listed candidate`));
    else if (seen.has(alias))
      problems.push(problem('critical', `${alias} is given more than one verdict`, [alias]));
    seen.add(alias);
  }
  return problems;
};

const limits: Rule = (pack, index) => {
  const given = new Set(verdicts(pack));
  const problems = index.candidates
    .filter((candidate) => !given.has(candidate.alias))
    .map((candidate) => problem('high', `${candidate.alias} has no verdict`));
  if (pack.kept.length > index.maxKept) {
    problems.push(
      problem('high', `${pack.kept.length} chunks kept; the limit is ${index.maxKept}`),
    );
  }
  return problems;
};

export const referencesValidator: Validator<MemoryPack> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${MEMORY_RECALL_ID} index`)],
);

export const limitsValidator: Validator<MemoryPack> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
);
