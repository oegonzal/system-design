/**
 * The exact checks: what the index says against what the pack cites. A pack
 * that cites what was never recalled, or leaves a candidate unjudged, cannot
 * be trusted by any lens, so both block.
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
import { MEMORY_RECALL_ID, readIndex, type MemoryIndex } from './input';
import type { MemoryPack } from './output';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<MemoryPack, MemoryIndex>;

/** Every candidate the pack gives a verdict, kept or dropped. */
const verdicts = (pack: MemoryPack): string[] => [
  ...pack.kept.map((item) => item.chunk),
  ...pack.dropped.map((item) => item.chunk),
];

const candidatesOf = (index: MemoryIndex): string[] =>
  index.candidates.map((candidate) => candidate.alias);

const references: Rule = (pack, index) =>
  misplaced(
    candidatesOf(index),
    verdicts(pack).map((ref) => ({ ref })),
    {
      unlisted: (alias) => `${alias} is not a listed candidate`,
      repeated: (alias) => `${alias} is given more than one verdict`,
    },
  );

const limits: Rule = (pack, index) => [
  ...unplaced(candidatesOf(index), verdicts(pack), 'high', (alias) => `${alias} has no verdict`),
  ...overLimit(pack.kept.length, index.maxKept, 'chunks kept'),
];

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
