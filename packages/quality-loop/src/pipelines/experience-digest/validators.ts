/**
 * The exact checks: what the index says against what the digest cites. A
 * digest that rests on evidence the record never held, or leaves evidence
 * unplaced, cannot be trusted by any lens, so both block.
 */
import {
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  misplaced,
  overLimit,
  problem,
  REFERENCES_VALIDATOR_ID,
  unplaced,
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

const evidenceOf = (index: ExperienceIndex): string[] => index.evidence.map((item) => item.alias);

const references: Rule = (digest, index) =>
  misplaced(
    evidenceOf(index),
    placements(digest).map((ref) => ({ ref })),
    {
      unlisted: (alias) => `${alias} is not listed evidence`,
      repeated: (alias) => `${alias} is placed more than once`,
    },
  );

const limits: Rule = (digest, index) => [
  ...unplaced(
    evidenceOf(index),
    placements(digest),
    'high',
    (alias) => `${alias} is neither used nor listed as unused`,
  ),
  ...overLimit(digest.memories.length, index.maxMemories, 'memories proposed'),
];

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
