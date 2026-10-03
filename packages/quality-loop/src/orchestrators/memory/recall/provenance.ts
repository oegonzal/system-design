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
 * The words that only introduce or join a citation — "(see p1)", "(p2 and
 * k1)", "(cf. d3)" — and say nothing once what they cite is gone. Read only
 * inside a bracket every label of which was dropped; anywhere else the
 * curator's words are its own and are kept as written.
 */
const CITATION_CONNECTIVES: ReadonlySet<string> = new Set([
  'see',
  'cf',
  'cf.',
  'e.g.',
  'i.e.',
  'per',
  'via',
  'and',
  'or',
  'also',
  'in',
  'at',
]);

/** The bracket pairs a sentence opens and closes, matched as written; an unclosed one is no pair. */
const BRACKETS: Readonly<Record<string, string>> = { '(': ')', '[': ']' };

/** Where each matched bracket pair opens and closes, innermost first. */
function bracketPairs(prose: string): { open: number; close: number }[] {
  const pairs: { open: number; close: number }[] = [];
  const opened: { at: number; closer: string }[] = [];
  for (let index = 0; index < prose.length; index += 1) {
    const char = prose.charAt(index);
    const closer = BRACKETS[char];
    if (closer !== undefined) opened.push({ at: index, closer });
    else if (opened.at(-1)?.closer === char) {
      const open = opened.pop()?.at ?? index;
      pairs.push({ open, close: index });
    }
  }
  return pairs;
}

/** A range of the prose, start inclusive, end exclusive. */
interface Span {
  start: number;
  end: number;
}

/**
 * Whether what a bracket holds, once the dropped labels inside it are taken
 * out, is only what they left: separators, stops and citation connectives.
 */
function onlyDebris(prose: string, inside: Span, dropped: readonly Span[]): boolean {
  let rest = '';
  let cursor = inside.start;
  for (const span of dropped) {
    rest += ` ${prose.slice(cursor, span.start)} `;
    cursor = span.end;
  }
  rest += prose.slice(cursor, inside.end);
  return rest
    .split(/\s+/u)
    .map((word) => trimSeparators(word).toLowerCase())
    .every((word) => word === '' || CITATION_CONNECTIVES.has(word));
}

/**
 * Where each dropped group goes: its own span, widened to the bracket around
 * it — with the space before that bracket — when every label the bracket
 * holds was dropped and nothing else but what they left is in it. One span
 * may cover several groups; spans are returned in order and never overlap.
 */
function removedSpans(prose: string, groups: readonly { span: Span; dropped: boolean }[]): Span[] {
  const spans = groups.filter((group) => group.dropped).map((group) => group.span);
  const within = (span: Span, outer: Span): boolean =>
    span.start >= outer.start && span.end <= outer.end;
  const widened = bracketPairs(prose).flatMap(({ open, close }): Span[] => {
    const inside = { start: open + 1, end: close };
    const held = groups.filter((group) => within(group.span, inside));
    if (held.length === 0 || held.some((group) => !group.dropped)) return [];
    const labels = held.map((group) => group.span);
    if (!onlyDebris(prose, inside, labels)) return [];
    let start = open;
    while (start > 0 && /\s/u.test(prose.charAt(start - 1))) start -= 1;
    return [{ start, end: close + 1 }];
  });
  // An outer bracket swallows an inner one and every group either holds.
  const all = [...widened, ...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  for (const span of all) {
    const last = kept.at(-1);
    if (last !== undefined && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
    } else kept.push({ ...span });
  }
  return kept;
}

/** A clause's stop, or a bracket's close: what a removal must not leave a space before. */
const STOPS_AFTER = /^[,;:.)\]]/u;

/** A bracket's open: what a removal must not leave a space after. */
const OPENS_BEFORE = /[([]$/u;

/**
 * `before` and `after` joined where a span was removed: one space where the
 * removed span had a space beside it, and none before a stop, after a
 * bracket's open or at either end — the spacing a removal broke, mended there
 * and nowhere else.
 */
function joinAcross(before: string, after: string, spaced: boolean): string {
  const head = before.replace(/\s+$/u, '');
  const tail = after.replace(/^\s+/u, '');
  if (head === '' || tail === '' || STOPS_AFTER.test(tail) || OPENS_BEFORE.test(head)) {
    return head + tail;
  }
  const apart = spaced || head.length < before.length || tail.length < after.length;
  return apart ? `${head} ${tail}` : head + tail;
}

/** Whether the prose has a space just inside or just outside either end of a span. */
const spacedAround = (prose: string, span: Span): boolean =>
  [span.start - 1, span.start, span.end - 1, span.end].some((index) =>
    /\s/u.test(prose.charAt(index)),
  );

/**
 * The curator's words in the asker's terms: each label, or each run of
 * labels listed together, becomes what it stands for — once each, joined as
 * the ref grammar joins a list — or nothing, and what a dropped label leaves
 * behind goes with it: a bracket that held only dropped labels and the
 * connectives citing them, a space before a stop where one was removed, the
 * separators and stops at either end. A part with no letter or digit left
 * says nothing and is empty; the curator's other words are kept as written.
 * A sentence that names no label is returned as written.
 */
export function inAskerTerms(prose: string, terms: AskerTerms): string {
  const mentions = refMentions(prose, [...terms.keys()]);
  if (mentions.length === 0) return prose;
  const groups = groupsOf(prose, mentions).map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    const standsFor = [
      ...new Set(group.flatMap((mention) => mention.ids.flatMap((id) => terms.get(id) ?? []))),
    ];
    return {
      span: { start: first.index, end: last.index + last.text.length },
      said: standsFor.join(' / '),
      dropped: standsFor.length === 0,
    };
  });
  const removed = removedSpans(prose, groups);
  const edits = [
    ...removed.map((span) => ({ span, said: null })),
    ...groups
      .filter((group) => !group.dropped)
      .map((group) => ({ span: group.span, said: group.said })),
  ].sort((a, b) => a.span.start - b.span.start);
  let out = '';
  let cursor = 0;
  // Where the last edit removed a span, whether a space stood beside it.
  let mend: { spaced: boolean } | null = null;
  for (const { span, said } of edits) {
    const between = prose.slice(cursor, span.start);
    out = mend === null ? out + between : joinAcross(out, between, mend.spaced);
    if (said === null) mend = { spaced: spacedAround(prose, span) };
    else {
      out += said;
      mend = null;
    }
    cursor = span.end;
  }
  const rest = prose.slice(cursor);
  const said = trimSeparators(mend === null ? out + rest : joinAcross(out, rest, mend.spaced));
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
