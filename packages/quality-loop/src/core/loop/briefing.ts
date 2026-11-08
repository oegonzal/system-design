/**
 * What the next ask is told about the attempt just before: the faults the
 * schema refused a lost produce for, the validator notes that blocked an
 * attempt which never became best, and the findings the judges confirmed
 * against one that was judged and fell short. The producer revises the best
 * with the best's remediations; without these it would never hear what its
 * own last attempt got wrong. And which of the best's remediations it is
 * handed at all: every one, or under a declared briefing cap the worst of
 * them (`briefedRemediations`).
 */
import {
  describeIssue,
  PRODUCE_MODES,
  type DecisionPolicy,
  type IterationTrace,
  type RemediationNote,
  type SchemaIssue,
} from '@sysdesign/contracts';

import { PRODUCER_STAGE } from '../stages/shared';

const wasBlocked = <T>(entry: IterationTrace<T>): boolean =>
  entry.validation.some((report) => report.gate === 'block' && report.problems.length > 0);

/** An iteration the loop asked the producer for, which answered nothing. */
export const lostProduce = <T>(entry: IterationTrace<T>): boolean =>
  entry.artifact === null && (PRODUCE_MODES as readonly string[]).includes(entry.mode);

/** The faults the schema refused a lost produce's reply for — kept on its diagnostic, never re-parsed. */
const refusedIssues = <T>(entry: IterationTrace<T>): SchemaIssue[] =>
  entry.ledger.diagnostics
    .filter((diagnostic) => diagnostic.stage === PRODUCER_STAGE)
    .flatMap((diagnostic) => diagnostic.facts?.issues ?? []);

/** One note per fault, in the one wording; a fault noted and not refused is no more than info. */
const schemaRefusal = (issue: SchemaIssue): RemediationNote => ({
  subject: { schema: issue.path },
  action: 'retry',
  severity: issue.soft ? 'info' : 'critical',
  targetRefs: [],
  note: describeIssue(issue),
});

/**
 * Why the attempt just before was refused before any judge read it, when it
 * was. A produce that answered nothing: the faults the schema refused its
 * reply for, so the ask that replaces it names them. An iteration a validator
 * blocked that never became best: the validator notes — the producer revises
 * the best artifact with the best remediations, so nothing else would tell it
 * why its last attempt was refused.
 */
export const refusalsOf = <T>(
  previous: IterationTrace<T> | null,
  best: IterationTrace<T> | null,
): RemediationNote[] => {
  if (previous === null) return [];
  if (lostProduce(previous)) return refusedIssues(previous).map(schemaRefusal);
  return previous !== best && wasBlocked(previous)
    ? previous.remediations.filter((note) => 'validator' in note.subject)
    : [];
};

/** An iteration the lenses read: it had an artifact and no validator blocked it. */
const wasJudged = <T>(entry: IterationTrace<T>): boolean =>
  entry.artifact !== null && !wasBlocked(entry);

const findingOf = (note: RemediationNote): string | null =>
  'finding' in note.subject ? note.subject.finding : null;

/**
 * What the judges confirmed wrong with the attempt just before, when it was
 * judged and did not become best. The producer revises the best with the
 * best's remediations, so without these it never hears what its last attempt
 * got wrong — and, handed the same brief, writes the same thing again. Its
 * finding notes only, as the policy selected them; a finding the best's
 * remediations already name (the same key, the identity `deriveLessons`
 * compares iterations by) is said there once.
 */
export const setbacksOf = <T>(
  previous: IterationTrace<T> | null,
  best: IterationTrace<T> | null,
): RemediationNote[] => {
  if (previous === null || previous === best || !wasJudged(previous)) return [];
  const held = new Set((best?.remediations ?? []).flatMap((note) => findingOf(note) ?? []));
  return previous.remediations.filter((note) => {
    const finding = findingOf(note);
    return finding !== null && !held.has(finding);
  });
};

/**
 * The remediations of the best the next ask is handed. Every one, when the
 * policy declares no briefing cap. Under one, every validator note — the
 * artifact is refused until it passes them, whatever else it fixes — then
 * the rest in the order the controller selected them, worst first, up to
 * the cap; each stays in its place in that order. `withheld` counts the
 * notes kept back, so the prompt can say so; the decision and the trace keep
 * the whole list. Why a pipeline caps, and the measurement behind the first
 * cap declared, is on `DecisionPolicy.briefing` in contracts.
 */
export function briefedRemediations(
  notes: readonly RemediationNote[],
  policy: DecisionPolicy,
): { handed: RemediationNote[]; withheld: number } {
  const cap = policy.briefing?.remediationsPerRound;
  if (cap === undefined) return { handed: [...notes], withheld: 0 };
  const chosen = new Set(notes.filter((note) => 'validator' in note.subject));
  for (const note of notes) {
    if (chosen.size >= cap) break;
    chosen.add(note);
  }
  const handed = notes.filter((note) => chosen.has(note));
  return { handed, withheld: notes.length - handed.length };
}
