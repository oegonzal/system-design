/**
 * The exact checks: what the index says against what the digest wrote. Two
 * block and three warn, and the split is the point.
 *
 * **Blocking** is bookkeeping — an item resting on evidence the record never
 * held, or a listed alias left unplaced, cannot be trusted by any lens, so the
 * artifact never reaches one.
 *
 * **Warning** is content: an item that borrows this run's vocabulary, names a
 * dimension its own evidence does not land on, or claims a kind its evidence
 * cannot support. Each is exactly checkable from the index, and each is the
 * fault of one item rather than of the digest. They warn because the measured
 * rate makes blocking self-defeating: 44 of 386 stored lessons carry a
 * run-local token, about one item in nine, so at twelve items a blocking rule
 * would refuse most first drafts, and two refusals lose the whole digest.
 * A warn problem lands on the iteration's validation, reaches the producer as a
 * revision to make, and leaves `validatorsPassed` standing — and the shared
 * reader is what decides whether a faulted item is stored.
 *
 * Nothing here reads prose. Every rule is a lookup against ids the codec itself
 * wrote into the index.
 */
import type { ValidationProblem } from '@sysdesign/contracts';

import {
  LIMITS_VALIDATOR_ID,
  REFERENCES_VALIDATOR_ID,
  indexedValidator,
  problem,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { KNOWLEDGE_DIGEST_ID, readIndex, vocabularyOf, type KnowledgeIndex } from './input';
import { itemLocation, type KnowledgeDigest } from './output';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

/** A dimension an item named that none of its own evidence lands on. */
export const DIMENSION_VALIDATOR_ID = 'dimension';
/** An item that borrowed a token of this run: an alias, an iteration, a place in the artifact. */
export const GENERALITY_VALIDATOR_ID = 'run-specificity';
/** An item whose kind its cited evidence cannot support. */
export const KINDS_VALIDATOR_ID = 'kinds';

type Rule = IndexedRule<KnowledgeDigest, KnowledgeIndex>;

/** Every evidence alias the digest places somewhere: under an item, or under unused. */
const placements = (digest: KnowledgeDigest): string[] => [
  ...digest.memories.flatMap((item) => item.evidence),
  ...digest.unused,
];

const references: Rule = (digest, index) => {
  const known = new Set(index.evidence.map((item) => item.alias));
  const recalled = new Set(index.known.map((item) => item.alias));
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const alias of placements(digest)) {
    if (!known.has(alias)) problems.push(problem('critical', `${alias} is not listed evidence`));
    else if (seen.has(alias))
      problems.push(problem('critical', `${alias} is placed more than once`, [alias]));
    seen.add(alias);
  }
  digest.memories.forEach((item, position) => {
    const at = [itemLocation(position)];
    for (const alias of [...item.confirms, ...item.contradicts]) {
      if (!recalled.has(alias)) {
        problems.push(problem('critical', `${alias} is not a listed known item`, at));
      }
    }
    // Confirming and contradicting one known item at once says nothing a store
    // could act on: the one claim would both raise and dispute its support.
    const both = item.confirms.filter((alias) => item.contradicts.includes(alias));
    for (const alias of both) {
      problems.push(problem('critical', `${alias} is both confirmed and contradicted`, at));
    }
  });
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
        `${digest.memories.length} items proposed; the limit is ${index.maxMemories}`,
      ),
    );
  }
  return problems;
};

/**
 * Whether `token` occurs in `text` as a whole token. The guard is any character
 * that is not a letter, a digit or an underscore, so a listed `i1` is found in
 * "at i1" and not in "wifi1", and a listed `node.3` is not found inside
 * `node.30`. The dot in an id is matched literally — this is a search for an id
 * the codec itself wrote, never a pattern over the shape of prose.
 */
export function borrows(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(text);
}

const generality: Rule = (digest, index) => {
  const vocabulary = vocabularyOf(index);
  const tokens = [
    ...vocabulary.evidence.map((token) => [token, 'an evidence alias'] as const),
    ...vocabulary.known.map((token) => [token, 'a known item alias'] as const),
    ...vocabulary.iterations.map((token) => [token, 'an iteration of this run'] as const),
    ...vocabulary.locations.map((token) => [token, "a place in this run's artifact"] as const),
  ];
  return digest.memories.flatMap((item, position) => {
    const texts = [item.insight, item.appliesWhen, ...item.topics];
    const found = tokens.filter(([token]) => texts.some((text) => borrows(text, token)));
    return found.length === 0
      ? []
      : [
          problem(
            'high',
            `${itemLocation(position)} names ${found
              .slice(0, 4)
              .map(([token, what]) => `${token} (${what})`)
              .join(', ')}, which another prompt cannot resolve`,
            [itemLocation(position)],
          ),
        ];
  });
};

const dimension: Rule = (digest, index) => {
  const dimensionOf = new Map(index.evidence.map((item) => [item.alias, item.dimension]));
  return digest.memories.flatMap((item, position) => {
    const earned = item.evidence
      .map((alias) => dimensionOf.get(alias) ?? null)
      .filter((value): value is string => value !== null);
    // Evidence whose kinds the source policy maps nowhere earns no dimension,
    // and then there is nothing to check against.
    if (earned.length === 0 || earned.includes(item.dimension)) return [];
    return [
      problem(
        'high',
        `${itemLocation(position)} names dimension ${item.dimension}; its evidence lands on ${[
          ...new Set(earned),
        ].join(', ')}`,
        [itemLocation(position)],
      ),
    ];
  });
};

/**
 * What each kind must rest on, as a table over what the index records. A
 * procedure claims a change was made and so needs a finding the engine recorded
 * as resolved; a pattern needs something that worked — a criterion that held
 * throughout, or a finding that resolved; an anti-pattern needs a defect. A
 * fact needs only evidence, which `references` already requires.
 */
const KIND_RULES: Record<
  string,
  { needs: string; holds: (item: KnowledgeIndex['evidence'][number]) => boolean }
> = {
  procedure: {
    needs: 'a finding whose transition says resolved',
    holds: (item) => item.kind === 'finding' && item.transitions.includes('resolved'),
  },
  pattern: {
    needs: 'a criterion that held throughout, or a finding that resolved',
    holds: (item) =>
      (item.kind === 'criterion' && item.held) ||
      (item.kind === 'finding' && item.transitions.includes('resolved')),
  },
  anti_pattern: { needs: 'a confirmed finding', holds: (item) => item.kind === 'finding' },
};

const kinds: Rule = (digest, index) => {
  const byAlias = new Map(index.evidence.map((item) => [item.alias, item]));
  return digest.memories.flatMap((item, position) => {
    const rule = KIND_RULES[item.kind];
    if (rule === undefined) return [];
    const cited = item.evidence.flatMap((alias) => {
      const entry = byAlias.get(alias);
      return entry === undefined ? [] : [entry];
    });
    return cited.some((entry) => rule.holds(entry))
      ? []
      : [
          problem(
            'high',
            `${itemLocation(position)} is a ${item.kind}, which rests on ${rule.needs}; none of its evidence is`,
            [itemLocation(position)],
          ),
        ];
  });
};

export const referencesValidator: Validator<KnowledgeDigest> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${KNOWLEDGE_DIGEST_ID} index`)],
);

export const limitsValidator: Validator<KnowledgeDigest> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
);

/** The three content rules warn: each faults one item, and the reader decides what a fault costs. */
const warning = (validator: Validator<KnowledgeDigest>): Validator<KnowledgeDigest> => ({
  ...validator,
  gate: 'warn',
  validate: (artifact, contract) => ({ ...validator.validate(artifact, contract), gate: 'warn' }),
});

export const generalityValidator: Validator<KnowledgeDigest> = warning(
  indexedValidator(GENERALITY_VALIDATOR_ID, readIndex, generality, []),
);

export const dimensionValidator: Validator<KnowledgeDigest> = warning(
  indexedValidator(DIMENSION_VALIDATOR_ID, readIndex, dimension, []),
);

export const kindsValidator: Validator<KnowledgeDigest> = warning(
  indexedValidator(KINDS_VALIDATOR_ID, readIndex, kinds, []),
);
