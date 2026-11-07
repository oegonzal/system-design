/**
 * The words a form goal says beside its evidence and in its Limits — the
 * legends over the evidence, and each form pipeline's terms — kept apart from
 * the codec that renders them (`field-goal.ts`): what the goal says in words
 * changes with the vocabularies it is built from, what it renders where does
 * not.
 */
import {
  MEMORY_SCOPE_USES,
  MEMORY_SCOPES,
  UNIT_BOUND_SCOPES,
  type MemoryScope,
} from '../units/scope';
import { SUGGESTIONS_BOUND } from './answer-suggestions.schema';
import {
  ANSWER_SUGGESTIONS_PIPELINE_ID,
  FIELD_ANSWER_PIPELINE_ID,
  type FormPipeline,
} from './pipelines';
import {
  ANSWER_BASES,
  ANSWER_BASIS_MEANINGS,
  CITING_ANSWER_BASES,
  UNCITED_ANSWER_BASES,
} from './vocab';

/**
 * What each kind of evidence listed is, said once above the evidence from the
 * kinds the composer declares — a store's own, never read off the items — so
 * every stage reads a kind as declared.
 */
export const kindsLegend = (kinds: readonly { kind: string; use: string }[]): string =>
  `Kinds: ${kinds.map(({ kind, use }) => `${kind} — ${use}`).join('; ')}.`;

/** Where each item holds, said once beside the kinds: a unit item is no evidence for another unit of work. */
const SCOPE_LEGEND = `Scopes: ${MEMORY_SCOPES.map((scope) => `${scope} — ${MEMORY_SCOPE_USES[scope]}`).join('; ')}. A unit item settles only a field about the unit of work this goal names.`;

/**
 * Said after the scopes when the goal names its unit, of the scopes bound to
 * a unit of work: the recall searched what was recorded for one unit only
 * under the key the index names — the unit's declared identity, else its own
 * id (`unitKeyOf`) — so every item of those scopes listed was recorded for a
 * unit its mission identifies as this one, which need not be this very unit.
 * Built from the table the recall's filter reads (`UNIT_BOUND_SCOPES`) and
 * said only when the index names the key the filter searched under, so the
 * sentence and the search cannot disagree — an item's text often names no
 * unit at all ("this organization"). Null when no scope is bound: the search
 * then leaves nothing out, and there is nothing to say.
 */
export const unitNamedLegend = (bound: readonly MemoryScope[]): string | null =>
  bound.length === 0
    ? null
    : `Every ${bound.join(' or ')} item listed was recorded for a unit of work its mission identifies as the one this goal names.`;

/** The scope legend this goal states. */
export const scopeLegend = (unitKey: string | undefined): string => {
  const named = unitKey === undefined ? null : unitNamedLegend(UNIT_BOUND_SCOPES);
  return named === null ? SCOPE_LEGEND : `${SCOPE_LEGEND} ${named}`;
};

/** Each form pipeline's words for an empty evidence list, and its limits. */
export const FORM_GOAL_TERMS: Readonly<
  Record<FormPipeline, { noEvidence: string; limits: readonly string[] }>
> = {
  [FIELD_ANSWER_PIPELINE_ID]: {
    noEvidence: `(none recalled: no value rests on the evidence; one declared ${UNCITED_ANSWER_BASES.join(' or ')} rests on its own section of the goal and stands; route the rest to the operator)`,
    limits: [
      '- Answer every listed field exactly once, by its ref, in the order listed.',
      "- A value stays within the field's character limit; a selectable field takes one of its listed options, or where the list counts more the page offers, one of those verbatim; a field you type into that lists options takes an option's exact words, and words it holds that are none of its options are no choice — answer it, never keep them; a number field takes a number.",
      `- A field the page hides is left blank. A value rests on listed evidence, cited by alias, or — declared ${UNCITED_ANSWER_BASES.join(' or ')} — on the section of the goal that kind's meaning below names; with none of these, ask the operator.`,
      `- Each value declares how it rests, by one word: ${ANSWER_BASES.map((kind) => `${kind} — ${ANSWER_BASIS_MEANINGS[kind]}`).join('; ')}. A value resting on the evidence (${CITING_ANSWER_BASES.join(', ')}) cites it by alias; one resting on ${UNCITED_ANSWER_BASES.join(' or ')} cites none; a mapped value needs options to map onto; a keep, an ask or a blank rests on none.`,
      '- Validators check these limits; they are not criteria.',
    ],
  },
  [ANSWER_SUGGESTIONS_PIPELINE_ID]: {
    noEvidence:
      '(none recalled: no suggestion rests on the record; draft only where the suggesting policy allows, labelled as a draft)',
    limits: [
      `- Suggest for every listed field exactly once, by its ref, in the order listed: at most ${SUGGESTIONS_BOUND.target} suggestions each, none repeating another; a field nothing supports gets none.`,
      "- A suggestion stays within the field's character limit; a selectable field takes one of its listed options verbatim; a number field takes a number.",
      '- A record or transfer suggestion cites the listed evidence it rests on, by alias.',
      '- Validators check these limits; they are not criteria.',
    ],
  },
};
