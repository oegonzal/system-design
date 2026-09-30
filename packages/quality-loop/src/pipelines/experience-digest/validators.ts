/**
 * The exact checks: what the index says against what the digest cites. A
 * digest that rests on evidence the record never held, or leaves evidence
 * unplaced, cannot be trusted by any lens, so both block.
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
import { EXPERIENCE_DIGEST_ID, readIndex, type ExperienceIndex } from './input';
import type { ExperienceDigest } from './output';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<ExperienceDigest, ExperienceIndex>;

/** Every alias the digest places somewhere: under a memory, or under unused. */
const placements = (digest: ExperienceDigest): string[] => [
  ...digest.memories.flatMap((memory) => memory.evidence),
  ...digest.unused,
];

const references: Rule = (digest, index) => {
  const known = new Set(index.evidence.map((item) => item.alias));
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const alias of placements(digest)) {
    if (!known.has(alias)) problems.push(problem('critical', `${alias} is not listed evidence`));
    else if (seen.has(alias))
      problems.push(problem('critical', `${alias} is placed more than once`, [alias]));
    seen.add(alias);
  }
  return problems;
};

const limits: Rule = (digest, index) => {
  const placed = new Set(placements(digest));
  const problems = index.evidence
    .filter((item) => !placed.has(item.alias))
    .map((item) => problem('high', `${item.alias} is neither used nor listed as unused`));
  if (digest.memories.length > index.maxMemories) {
    problems.push(
      problem(
        'high',
        `${digest.memories.length} memories proposed; the limit is ${index.maxMemories}`,
      ),
    );
  }
  return problems;
};

export const referencesValidator: Validator<ExperienceDigest> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${EXPERIENCE_DIGEST_ID} index`)],
);

export const limitsValidator: Validator<ExperienceDigest> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
);
