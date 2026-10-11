/**
 * Suggested answers as the lenses read them: the summary, every field by its
 * position, and every suggestion of a field by its position under it — ids
 * engine-assigned (`field.2`, `field.2.1`), never the page's refs, the ref
 * printed beside each so a finding at `field.2.1` is a finding about one
 * suggestion for one field.
 */
import {
  answerSuggestionsSchema,
  quotedJson,
  suggestionLocation,
  type AnswerSuggestions,
} from '@sysdesign/contracts';

import type { OutputShape } from '../../core/contracts';

type FieldSuggestions = AnswerSuggestions['fields'][number];
type Suggestion = FieldSuggestions['suggestions'][number];

const fieldLocationOf = (position: number): string => `field.${position + 1}`;

/** `[field.1.2] transfer — cites m3 — "…" — why: …`: the label, what it rests on, the answer, why. */
const suggestionLine = (suggestion: Suggestion, field: number, position: number): string =>
  [
    `[${suggestionLocation(field, position)}] ${suggestion.basis}`,
    `cites ${suggestion.cites.length > 0 ? suggestion.cites.join(', ') : 'none'}`,
    quotedJson(suggestion.text),
    `why: ${suggestion.why}`,
  ].join(' — ');

export const answerSuggestionsOutput: OutputShape<AnswerSuggestions> = {
  schema: answerSuggestionsSchema,

  locate: (suggested) => [
    { id: 'summary', label: 'Summary' },
    ...suggested.fields.flatMap((field, at) => [
      { id: fieldLocationOf(at), label: `${field.ref}: ${field.suggestions.length} suggestions` },
      ...field.suggestions.map((suggestion, position) => ({
        id: suggestionLocation(at, position),
        label: `${field.ref} ${suggestion.basis}`,
      })),
    ]),
  ],

  render: (suggested) =>
    [
      `[summary] ${suggested.summary}`,
      '',
      'Fields:',
      ...suggested.fields.flatMap((field, at) => [
        `[${fieldLocationOf(at)}] ${field.ref} — ${field.suggestions.length === 0 ? 'no suggestions' : `${field.suggestions.length} suggestions`}`,
        ...field.suggestions.map(
          (suggestion, position) => `  ${suggestionLine(suggestion, at, position)}`,
        ),
      ]),
    ].join('\n'),
};
