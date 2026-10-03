/**
 * A recall as a run records it: what `recallMemory` came to, in the run
 * recall's closed vocabulary, and each usable memory as the lesson the
 * producer is handed — the curator's words beside the stored lesson, and the
 * run, pipeline, iteration, decision and day it came from, so what a
 * producer saw can be audited against the store — with what its screen set
 * aside as already in hand, when it screened.
 *
 * The curator wrote against its own query, which labelled the asker's needs
 * for it: `d1…` for the defects it was focused on, `p1…` for the derived
 * conditions, `k1…` for what the producer already held, and its own rubric's
 * criterion ids, `c1…`, for the needs it derived. None of those labels means
 * anything to the producer or the author — and `c8` reads as the asker's own
 * c8, which it is not — so the curator's words are read back in the asker's
 * terms before either sees them: a defect label as the criterion the asker
 * fell short on, or the defect's own words; a rubric id as whatever the focus
 * labels its statement cites stand for; anything else is dropped.
 */
import {
  listedTogether,
  recallOf,
  recallWithout,
  refIdsIn,
  refMentions,
  tokenWords,
  withRecallDeferred,
  withRecallFocus,
  withRecallNovelty,
  type RecalledLessonDto,
  type RecallFocusDto,
  type RefMention,
  type RunRecallDto,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import {
  focusAlias,
  knownAlias,
  MAX_FOCUS,
  MAX_KNOWN,
  MAX_PROBES,
  probeAlias,
} from '../../../pipelines/memory-recall/input';
import { focusLines } from './focus';
import { probeSet } from './query';
import type { Recalled } from './recall-memory';
import type { UsableMemory } from './read-pack';

/** What one of the curator's labels stands for in the asker's terms; empty when nothing. */
export type AskerTerms = ReadonlyMap<string, readonly string[]>;

/**
 * Each focus label as the query listed it — the focus lines kept the way the
 * search kept them, deduped, so `d3` is the third line the curator read —
 * with what it stands for: a criterion the asker fell short on is its own
 * id, a defect is its type in words.
 */
function focusTerms(focus: RecallFocusDto | null): Map<string, string[]> {
  if (focus === null) return new Map();
  const lines = focusLines(focus).map((line) => line.trim());
  const terms = [
    ...focus.findings.map((finding) => tokenWords(finding.type)),
    ...focus.criteria.map((criterion) => criterion.criterionId),
  ];
  // One line per finding, then per criterion: a line nobody could tell apart is no label at all.
  if (lines.length !== terms.length) return new Map();
  // The goal never repeats a focus line, so searching under none dedupes as the recall did.
  const listed = probeSet('', [], lines).focus;
  return new Map(
    listed.map((line, position) => [focusAlias(position), [terms[lines.indexOf(line)]]]),
  );
}

/**
 * Every label the curator's query could have given, with what it stands for
 * in the asker's terms. A rubric criterion stands for what the focus labels
 * its own statement cites stand for — the curator's need `c6` derived from
 * `d6` is `d6`'s — read with the one grammar ids are read from prose by. A
 * focus label the query did not list — every one, when it had no focus — is
 * a label all the same, and stands for nothing.
 */
export function askerTermsOf(
  focus: RecallFocusDto | null,
  rubric: readonly SuccessCriterion[],
): AskerTerms {
  const focused = focusTerms(focus);
  const focusLabels = [...focused.keys()];
  const standsFor = (criterion: SuccessCriterion): string[] => [
    ...new Set(
      refIdsIn(criterion.statement, focusLabels).flatMap((label) => focused.get(label) ?? []),
    ),
  ];
  const unmeaning = (alias: (position: number) => string, count: number): [string, string[]][] =>
    Array.from({ length: count }, (_, position) => [alias(position), []]);
  return new Map([
    ...unmeaning(focusAlias, MAX_FOCUS),
    ...unmeaning(probeAlias, MAX_PROBES),
    ...unmeaning(knownAlias, MAX_KNOWN),
    ...rubric.map((criterion): [string, string[]] => [criterion.id, standsFor(criterion)]),
    ...focused,
  ]);
}

/** Labels written side by side — `d6/c6`, `c2, c3` — stand for one thing once, not twice. */
function groupsOf(prose: string, mentions: readonly RefMention[]): RefMention[][] {
  const groups: RefMention[][] = [];
  for (const mention of mentions) {
    const last = groups.at(-1)?.at(-1);
    const together =
      last !== undefined &&
      listedTogether(prose.slice(last.index + last.text.length, mention.index));
    if (together) groups.at(-1)?.push(mention);
    else groups.push([mention]);
  }
  return groups;
}

/** What a dropped label leaves at an end of a part: a separator, as the ref grammar reads one, or a clause's stop. */
const isDebris = (char: string): boolean => listedTogether(char) || char === ':' || char === ';';

/** The separators and stops a dropped label leaves at either end. */
function trimSeparators(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isDebris(text.charAt(start))) start += 1;
  while (end > start && isDebris(text.charAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

/** What a part must keep to say anything: a letter or a digit. */
const SAYS_SOMETHING = /[\p{L}\p{N}]/u;

/**
 * The curator's words in the asker's terms: each label, or each run of
 * labels listed together, becomes what it stands for — once each, joined as
 * the ref grammar joins a list — or nothing, and what a dropped label leaves
 * behind goes with it: a space before a stop, the separators and stops at
 * either end. A part with no letter or digit left says nothing and is empty;
 * the curator's other words are kept as written. A sentence that names no
 * label is returned as written.
 */
export function inAskerTerms(prose: string, terms: AskerTerms): string {
  const mentions = refMentions(prose, [...terms.keys()]);
  if (mentions.length === 0) return prose;
  let out = '';
  let cursor = 0;
  for (const group of groupsOf(prose, mentions)) {
    const first = group[0];
    const last = group[group.length - 1];
    const standsFor = [
      ...new Set(group.flatMap((mention) => mention.ids.flatMap((id) => terms.get(id) ?? []))),
    ];
    out += prose.slice(cursor, first.index) + standsFor.join(' / ');
    cursor = last.index + last.text.length;
  }
  const said = trimSeparators(
    (out + prose.slice(cursor)).replace(/ {2,}/g, ' ').replace(/ +([,;:])/g, '$1'),
  );
  return SAYS_SOMETHING.test(said) ? said : '';
}

export const lessonOf = (
  { alias, kept, hit, rubric }: UsableMemory,
  focus: RecallFocusDto | null = null,
): RecalledLessonDto => {
  const terms = askerTermsOf(focus, rubric);
  const { runId, pipeline, iteration, decision, when } = hit.source;
  return {
    ref: alias,
    serves: inAskerTerms(kept.serves, terms),
    insight: inAskerTerms(kept.insight, terms),
    caveat: kept.caveat === null ? null : inAskerTerms(kept.caveat, terms),
    text: hit.text,
    sourceRunId: runId,
    pipeline,
    iteration,
    decision,
    when,
  };
};

/**
 * The run's record of a recall: recalled with its lessons, or empty or
 * skipped with the reason — with the defects it searched for beside the
 * prompt, when it was focused on any, what it screened out, when it
 * screened, and how many hits the goal budget left out of the curator's
 * query, when one was curated.
 */
export function provenanceOf(
  recalled: Recalled,
  focus: RecallFocusDto | null = null,
): RunRecallDto {
  return withRecallDeferred(
    withRecallNovelty(withRecallFocus(outcomeOf(recalled, focus), focus), recalled.novelty ?? null),
    recalled.status === 'complete' ? recalled.counts.deferred : 0,
  );
}

function outcomeOf(recalled: Recalled, focus: RecallFocusDto | null): RunRecallDto {
  switch (recalled.status) {
    case 'skipped':
      return recallWithout(recalled.reason, recalled.note);
    case 'failed':
      return recallWithout(recalled.reason, recalled.note, recalled.runId);
    case 'complete':
      return recalled.reason === null
        ? recallOf(
            recalled.usable.map((usable) => lessonOf(usable, focus)),
            recalled.runId,
          )
        : recallWithout(recalled.reason, null, recalled.runId);
  }
}
