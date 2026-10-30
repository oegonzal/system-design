import type { BoundSpace } from '@sysdesign/agentic-memory-client';
import {
  REGISTER_KIND_DECLARATIONS,
  LESSON_SEPARATOR,
  type FieldRoute,
  type MemoryRecordDto,
  type MemoryScope,
  type RecordScope,
} from '@sysdesign/contracts';

import { predicateOf } from '../../adapters/memory-loop/teach';

/**
 * What the replay measures, pure of every port: how a recorded evidence text
 * is found among the records recalled now, how a sample and a percentile are
 * taken, which operator answer a judged value is held to, what a judged
 * field's verdict is — a table over the routes, declared — and whether a
 * recalled record's own scope leaks past the scope it was recalled under.
 * Measurement rules, not business rules: nothing here decides what a session
 * does.
 */

/** A text as the comparison reads it: whitespace folded, the ends trimmed. */
export const foldWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * The two halves of a text the loop's store kept: the fact, and the condition
 * it applies under — the question, for a taught answer — split at the store's
 * own separator; a text without one is one fact under no condition.
 */
function recordedHalves(text: string): { insight: string; appliesWhen: string | null } {
  const at = text.lastIndexOf(LESSON_SEPARATOR);
  if (at < 0) return { insight: text, appliesWhen: null };
  return { insight: text.slice(0, at), appliesWhen: text.slice(at + LESSON_SEPARATOR.length) };
}

/** The declared fact a semantic record keeps, read by the kind's own candidate shape; null for a record of another kind. */
const factOf = (record: MemoryRecordDto): { predicate: string; value: string } | null => {
  const parsed = REGISTER_KIND_DECLARATIONS.semantic.candidate.safeParse(record.body);
  return parsed.success ? { predicate: parsed.data.predicate, value: parsed.data.value } : null;
};

/**
 * How a text the recorded run cited is found among what was recalled now —
 * three declared rules, each read apart, since the two stores rendered a fact
 * differently and only the facts behind the texts can be compared:
 * `equal`, the same words whitespace folded; `identity`, a record kept under
 * the predicate the brain gives the recorded condition — the question — so a
 * standing answer taught again is found whatever its wording became;
 * `contained`, a record whose value carries the recorded fact's words whole,
 * as an ingested fact digested again by another pipeline may.
 */
export interface CitedMatch {
  equal: boolean;
  identity: boolean;
  contained: boolean;
}

export const citedFound = (match: CitedMatch): boolean =>
  match.equal || match.identity || match.contained;

export function citedMatchOf(
  recorded: string,
  records: readonly MemoryRecordDto[],
  newTexts: ReadonlySet<string>,
): CitedMatch {
  const { insight, appliesWhen } = recordedHalves(recorded);
  const predicate = appliesWhen === null ? null : predicateOf(appliesWhen);
  const fact = foldWhitespace(insight);
  const facts = records.flatMap((record) => factOf(record) ?? []);
  return {
    equal: newTexts.has(foldWhitespace(recorded)),
    identity: predicate !== null && facts.some((kept) => kept.predicate === predicate),
    contained: fact.length > 0 && facts.some((kept) => foldWhitespace(kept.value).includes(fact)),
  };
}

/** The p-th percentile by nearest rank over the values given; null over none. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

/**
 * The indices of an evenly spaced sample of `size` out of `total`, in order —
 * every index when no size is given or the size covers the total — so a
 * sample of a long record spans its sessions rather than its first morning.
 */
export function sampledIndices(total: number, size: number | null): number[] {
  if (size === null || size >= total) return Array.from({ length: total }, (_, index) => index);
  return Array.from({ length: size }, (_, index) => Math.floor((index * total) / size));
}

/**
 * The operator's answers on record, for a judged value to be held to: by the
 * unit of work and the question an answer was given for, and — for an answer
 * the answerer declared the subject's, or one given outside any unit — by the
 * question alone, so a unit's answer is never held against another unit's
 * field. Recorded in dump order: a question answered twice stands by its
 * latest.
 */
export class KnownAnswers {
  private readonly ofUnit = new Map<string, string>();
  private readonly ofSubject = new Map<string, string>();

  record(
    question: string,
    answer: string,
    unitKey: string | null,
    about: MemoryScope | null,
  ): void {
    this.ofUnit.set(KnownAnswers.key(unitKey, question), answer);
    if (about === 'subject' || unitKey === null) this.ofSubject.set(question, answer);
  }

  /**
   * The answer a field on a page is held to: the one given for the page's own
   * unit; else — where the answerer declared the question the subject's, or
   * the page is outside any unit — the subject's; else none.
   */
  for(question: string, unitKey: string | null, about: MemoryScope | null): string | null {
    const own = this.ofUnit.get(KnownAnswers.key(unitKey, question));
    if (own !== undefined) return own;
    if (about !== 'subject' && unitKey !== null) return null;
    return this.ofSubject.get(question) ?? null;
  }

  private static key(unitKey: string | null, question: string): string {
    return `${unitKey ?? ''}\u0000${question}`;
  }
}

/**
 * What became of a judged field against its record: filled both times, newly
 * filled, no longer filled, asked both times — or filled with a value that is
 * not the answer the operator gave, which overrides the rest.
 */
export type Verdict = 'same-fill' | 'new-fill' | 'lost-fill' | 'same-ask' | 'wrong';

/** A route as the acceptance table counts it: a value typed, a person asked, or the field left as it was. */
type RouteClass = 'filled' | 'asked' | 'left';

/** Every route classified, so a route the vocabulary gains is classified here or the build refuses. */
const ROUTE_CLASS: Readonly<Record<FieldRoute, RouteClass>> = {
  fill: 'filled',
  keep: 'left',
  'ask-operator': 'asked',
  'leave-blank': 'left',
};

/** Recorded class × judged class → the verdict, for the pairs the acceptance table compares; null for the rest. */
const VERDICT_TABLE: Readonly<Record<RouteClass, Readonly<Record<RouteClass, Verdict | null>>>> = {
  filled: { filled: 'same-fill', asked: 'lost-fill', left: null },
  asked: { filled: 'new-fill', asked: 'same-ask', left: null },
  left: { filled: null, asked: null, left: null },
};

/**
 * The verdict for one judged field. A value typed where the operator's answer
 * is on record and differs is wrong whatever the routes say; otherwise the
 * table over the recorded and the judged route decides, and a pair outside it
 * is no verdict.
 */
export function verdictOf(
  recorded: FieldRoute,
  judged: FieldRoute,
  judgedValue: string | null,
  knownAnswer: string | null,
): Verdict | null {
  const typedWrong =
    ROUTE_CLASS[judged] === 'filled' &&
    knownAnswer !== null &&
    (judgedValue === null || foldWhitespace(judgedValue) !== foldWhitespace(knownAnswer));
  if (typedWrong) return 'wrong';
  return VERDICT_TABLE[ROUTE_CLASS[recorded]][ROUTE_CLASS[judged]];
}

/** Whether a record recalled under a request leaked past that request's scope, read off the record's own scope. */
interface ScopeLeaks {
  /** The record carries a unit key, and not the one the request narrowed by — none when the request named no unit. */
  unitLeak: boolean;
  /** The record's partition is not the tenant replayed under. */
  tenantLeak: boolean;
}

/**
 * The leaks a recalled record shows against the request that recalled it,
 * by the keys the bound space declares: a unit value the record carries that
 * the request did not name is a unit leak; a partition other than the tenant
 * is a tenant leak. Both read from the record's scope as the host answered
 * it with the recall, never from the evidence item's label.
 */
export function scopeLeaksOf(
  record: RecordScope,
  request: RecordScope,
  bound: Pick<BoundSpace, 'scope'>,
  tenant: string,
): ScopeLeaks {
  const unitKey = bound.scope.unit;
  const recordUnit = unitKey === null ? undefined : record[unitKey];
  const requestUnit = unitKey === null ? undefined : request[unitKey];
  return {
    unitLeak: recordUnit !== undefined && recordUnit !== requestUnit,
    tenantLeak: record[bound.scope.partition] !== tenant,
  };
}

/** One cell of the rows file; null prints as nothing. */
export type CsvCell = string | number | boolean | null;

const quoteCell = (cell: CsvCell): string => {
  const text = cell === null ? '' : String(cell);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One line of the rows file: cells joined by commas, a cell holding a comma, a quote or a line break quoted. */
export const csvLine = (cells: readonly CsvCell[]): string => cells.map(quoteCell).join(',');
