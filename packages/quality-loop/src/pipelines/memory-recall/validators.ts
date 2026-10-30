/**
 * The exact checks: what the index says against what the pack cites. A pack
 * that cites what was never recalled or listed, leaves a candidate unjudged,
 * or writes one of the query's labels where its reader will see it cannot be
 * trusted by any lens, so each blocks.
 */
import { refMentions } from '@sysdesign/contracts';

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
type KeptItem = MemoryPack['kept'][number];

/** Every candidate the pack gives a verdict, kept or dropped. */
const verdicts = (pack: MemoryPack): string[] => [
  ...pack.kept.map((item) => item.chunk),
  ...pack.dropped.map((item) => item.chunk),
];

const candidatesOf = (index: MemoryIndex): string[] =>
  index.candidates.map((candidate) => candidate.alias);

/** A kept chunk's words that reach the reader of the pack. */
const PROSE_FIELDS = ['serves', 'insight', 'caveat'] as const satisfies readonly (keyof KeptItem)[];

/** Each defect a kept chunk cites is one the query listed, once. */
const citations = (item: KeptItem, index: MemoryIndex) =>
  misplaced(
    index.focus,
    item.cites.map((ref) => ({ ref, at: [item.chunk] })),
    {
      unlisted: (ref) => `${item.chunk} cites ${ref}, which is not a listed defect`,
      repeated: (ref) => `${item.chunk} cites ${ref} more than once`,
    },
  );

/**
 * A label the query or the curator's own rubric gave a need, written into a
 * kept chunk's words: the reader of the pack never saw it, so it says nothing
 * there. The need is said in words, and a defect cited in `cites`.
 */
const labelsInProse = (item: KeptItem, labels: readonly string[]) =>
  PROSE_FIELDS.flatMap((field) => {
    const named = [...new Set(refMentions(item[field] ?? '', labels).flatMap((m) => m.ids))];
    return named.length === 0
      ? []
      : [
          problem(
            'high',
            `${item.chunk}'s ${field} names ${named.join(', ')}: the reader of the pack never sees the query's labels — say the need in words, and cite a listed defect in cites`,
            [item.chunk],
          ),
        ];
  });

const references: Rule = (pack, index, contract) => {
  const labels = [
    ...index.focus,
    ...index.known,
    ...index.probes,
    ...contract.criteria.map((criterion) => criterion.id),
  ];
  return [
    ...misplaced(
      candidatesOf(index),
      verdicts(pack).map((ref) => ({ ref })),
      {
        unlisted: (alias) => `${alias} is not a listed candidate`,
        repeated: (alias) => `${alias} is given more than one verdict`,
      },
    ),
    ...pack.kept.flatMap((item) => [...citations(item, index), ...labelsInProse(item, labels)]),
  ];
};

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
