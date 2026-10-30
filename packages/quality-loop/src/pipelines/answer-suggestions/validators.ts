/**
 * The exact checks on suggested answers: what the form's index says against
 * what the suggestions do. `references` blocks — suggestions for a field the
 * form never listed, or resting on evidence the goal never listed, cannot be
 * trusted by any lens. `citations` and `limits` only warn, each at the one
 * suggestion it names, and withhold that suggestion from whoever offers them:
 * a block would stop the iteration before any lens ran and, at one
 * iteration, throw away every field's suggestions for one fault. Nothing here
 * reads prose: every fact is in the index the composer wrote.
 */
import {
  fieldLocation,
  suggestionLocation,
  valueFaults,
  type AnswerSuggestions,
  type FieldIndex,
} from '@sysdesign/contracts';

import {
  asWarning,
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  misplaced,
  problem,
  REFERENCES_VALIDATOR_ID,
  unlisted,
  unplaced,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { readIndex } from './input';

type Rule = IndexedRule<AnswerSuggestions, FieldIndex>;

const CITATIONS_VALIDATOR_ID = 'citations';
/** The labels that rest on recorded evidence, and so must cite it. */
const CITING_BASES: ReadonlySet<string> = new Set(['record', 'transfer']);

/** Every listed field suggested for exactly once, every cited alias listed. */
const references: Rule = (suggested, index) => {
  const listed = index.fields.map((field) => field.ref);
  return [
    ...misplaced(
      listed,
      suggested.fields.map((field, at) => ({ ref: field.ref, at: [fieldLocation(at)] })),
      {
        unlisted: (ref) => `${ref} is not a listed field`,
        repeated: (ref) => `${ref} is suggested for more than once`,
      },
    ),
    ...unlisted(
      index.evidence.map((item) => item.alias),
      suggested.fields.flatMap((field, at) =>
        field.suggestions.flatMap((suggestion, position) =>
          suggestion.cites.map((alias) => ({ ref: alias, at: [suggestionLocation(at, position)] })),
        ),
      ),
      (alias) => `${alias} is not listed evidence`,
    ),
    ...unplaced(
      listed,
      suggested.fields.map((field) => field.ref),
      'critical',
      (ref) => `${ref} is not suggested for`,
    ),
  ];
};

/** A suggestion labelled as resting on the record cites what it rests on. */
const citations: Rule = (suggested) =>
  suggested.fields.flatMap((field, at) =>
    field.suggestions.flatMap((suggestion, position) =>
      CITING_BASES.has(suggestion.basis) && suggestion.cites.length === 0
        ? [
            problem('high', `${field.ref}: a ${suggestion.basis} suggestion cites no evidence`, [
              suggestionLocation(at, position),
            ]),
          ]
        : [],
    ),
  );

/** A suggestion the field cannot take, as the form codec states a field's limits. */
const limits: Rule = (suggested, index) => {
  const fields = new Map(index.fields.map((field) => [field.ref, field]));
  return suggested.fields.flatMap((field, at) => {
    const spec = fields.get(field.ref);
    // An unlisted ref has no field to check against; the references rule owns it.
    if (spec === undefined) return [];
    return field.suggestions.flatMap((suggestion, position) =>
      valueFaults(spec, suggestion.text).map((fault) =>
        problem(fault.severity, fault.message, [suggestionLocation(at, position)]),
      ),
    );
  });
};

export const referencesValidator: Validator<AnswerSuggestions> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', 'the goal carries no answer-suggestions index')],
);

export const citationsValidator: Validator<AnswerSuggestions> = asWarning(
  indexedValidator(CITATIONS_VALIDATOR_ID, readIndex, citations, []),
  'every-ref',
);

export const limitsValidator: Validator<AnswerSuggestions> = asWarning(
  indexedValidator(LIMITS_VALIDATOR_ID, readIndex, limits, []),
  'every-ref',
);
