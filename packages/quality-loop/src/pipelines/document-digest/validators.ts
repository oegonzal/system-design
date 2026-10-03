/**
 * The exact checks: what the index says against what the digest cites. A
 * digest that rests on a section the chunk never held, or says of one
 * section both that a fact rests on it and that nothing does, cannot be
 * trusted by any lens, so both validators block. Unlike the experience
 * digest, a section may back several memories: one paragraph of a résumé
 * states a title, an employer and a date range, and each is a fact of its
 * own. What must hold is that every section is placed — cited, or listed as
 * unused — and that no section is both.
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
import { DOCUMENT_DIGEST_ID, readIndex, type DocumentIndex } from './input';
import type { DocumentDigest } from './output';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<DocumentDigest, DocumentIndex>;

const citedSections = (digest: DocumentDigest): Set<string> =>
  new Set(digest.memories.flatMap((memory) => memory.evidence));

const references: Rule = (digest, index) => {
  const known = new Set(index.evidence.map((item) => item.alias));
  const cited = citedSections(digest);
  const problems: ValidationProblem[] = [];
  digest.memories.forEach((memory, position) => {
    for (const alias of memory.evidence) {
      if (!known.has(alias)) {
        problems.push(
          problem('critical', `${alias} is not a listed section`, [`memory.${position + 1}`]),
        );
      }
    }
  });
  const unused = new Set<string>();
  for (const alias of digest.unused) {
    if (!known.has(alias)) problems.push(problem('critical', `${alias} is not a listed section`));
    else if (cited.has(alias)) {
      problems.push(problem('critical', `${alias} is both cited and listed as unused`, [alias]));
    } else if (unused.has(alias)) {
      problems.push(problem('critical', `${alias} is listed as unused more than once`, [alias]));
    }
    unused.add(alias);
  }
  return problems;
};

const limits: Rule = (digest, index) => {
  const placed = new Set([...citedSections(digest), ...digest.unused]);
  const problems = index.evidence
    .filter((item) => !placed.has(item.alias))
    .map((item) => problem('high', `${item.alias} is neither cited nor listed as unused`));
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

export const referencesValidator: Validator<DocumentDigest> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${DOCUMENT_DIGEST_ID} index`)],
);

export const limitsValidator: Validator<DocumentDigest> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
);
