/**
 * The lines a run's record renders as, for every codec that composes a goal
 * from it. Each codec still decides what its goal says and in what order; what
 * is shared is how one criterion, one finding and one iteration read, so two
 * digests of one run are shown the same evidence the same way. A codec that
 * knows more about an item — the dimension it lands on, say — adds a note
 * after its kind or type.
 */
import type {
  Experience,
  IterationSummary,
  RecordedCriterion,
  RecordedFinding,
  Transition,
} from './schema';

/** How a record's reader is told a finding was confirmed by an earlier run's judges. */
const ADOPTED_FINDING_NOTE = 'adopted from an earlier run';

const signed = (value: number | null): string =>
  value === null ? '' : ` (${value > 0 ? '+' : ''}${value})`;

const scoreLine = (summary: IterationSummary): string =>
  Object.entries(summary.dimensions)
    .map(
      ([dimension, value]) =>
        `${dimension} ${value ?? 'n/a'}${signed(summary.dimensionDeltas[dimension] ?? null)}`,
    )
    .join(' · ');

const transitionText = (transitions: readonly Transition[]): string =>
  transitions
    .map((t) => `${t.kind} i${t.iterations[0]}→i${t.iterations[1]} (${t.detail})`)
    .join(', ');

/** One criterion: its results per iteration and every change in them; `kindNote` follows its kind. */
export const criterionLine = (item: RecordedCriterion, kindNote = ''): string => {
  const results = item.results.map((r) => `i${r.iteration} ${r.result}`).join(' → ');
  const transitions = item.transitions.length > 0 ? ` — ${transitionText(item.transitions)}` : '';
  return `- [${item.alias}] ${item.kind}${kindNote} · ${item.statement} — ${results}${transitions}`;
};

/** One finding: what it was, where, who saw it when, and what became of it; `typeNote` follows its type. */
export const findingLine = (item: RecordedFinding, typeNote = ''): string => {
  const parts = [
    `${item.type}${typeNote} · ${item.severity} · confidence ${item.confidence} · ${item.fixability}`,
    item.locationRefs.length > 0 ? `at ${item.locationRefs.join(', ')}` : 'artifact-wide',
    item.criteria.length > 0 ? `weakens ${item.criteria.join(', ')}` : null,
    `by ${item.lenses.join(', ')}`,
    `seen ${item.iterations.map((n) => `i${n}`).join(', ')}`,
    item.adopted ? ADOPTED_FINDING_NOTE : null,
    item.remediated ? 'remediated' : 'not remediated',
    item.reconciledTo ? `reconciled to ${item.reconciledTo}` : null,
    item.transitions.length > 0 ? transitionText(item.transitions) : null,
  ].filter((part): part is string => part !== null);
  return `- [${item.alias}] ${parts.join(' · ')}${item.rationale ? ` — ${item.rationale}` : ''}`;
};

/** The line a render gives what it left out of a list; nothing when it left nothing. */
export const omittedLine = (count: number, noun: string): string[] =>
  count > 0 ? [`(${count} more ${noun} omitted)`] : [];

/** The line a render gives the adopted findings a record left out; nothing when it left none. */
export const adoptedOmittedLines = (count: number): string[] =>
  count > 0
    ? [
        `(${count} more findings omitted: seen only in an iteration adopted from an earlier run, with no change this run judged)`,
      ]
    : [];

/** What the run decided, iteration by iteration; one iteration alone can claim no change. */
export const outcomeLines = (record: Experience): string[] => [
  `- Run ${record.runId} of ${record.pipeline}: final decision ${record.finalDecision}, stopped by ${record.stopReason}, best iteration i${record.bestIteration}.`,
  ...(record.iterations.length === 1
    ? ['- One iteration only: no transition exists, so no change in quality can be claimed.']
    : []),
  ...record.iterations.map(
    (it) =>
      `- i${it.iteration} (${it.mode}): ${it.decision} — overall ${it.overall}${signed(it.overallDelta)} — ${scoreLine(it)} — ${it.reason}`,
  ),
];
