/**
 * The Units of work section of a step goal: the open unit, the units closed
 * this session, the counts and the budget, and the units an advisor put on
 * record from earlier sessions. All of it engine facts for the planner: an
 * item already handled, here or before, is never taken up again unknowingly.
 * Measured 2026-10-07: with only counts to go on, the planner reopened the one
 * listing the session had handled, and the mission's "never the same listing
 * twice" had nothing to rest on.
 */
import { textBytes } from '../quality-loop/goal-index';
import { quoted } from '../text';
import { describeIdentity } from '../units/identity';
import type { UnitOnRecord, UnitsOnRecord } from '../units/record';
import {
  UNIT_STANCE_MEANINGS,
  UNIT_STANCE_ON_RECORD,
  UNIT_STANCES_STRONGEST_FIRST,
  UNITS_ON_RECORD_BYTES_BOUND,
} from '../units/vocab';
import type { TaskLedgerSummary } from './observation.schema';
import { TASK_OUTCOME_SPENDS, TASK_OUTCOMES } from './vocab';

/** A unit as the goal names it: its label, and its identity when it declared one. */
const describeUnit = (unit: {
  label: string;
  facets: TaskLedgerSummary['closed'][number]['facets'];
}): string =>
  unit.facets.length === 0
    ? quoted(unit.label)
    : `${quoted(unit.label)} · ${describeIdentity(unit.facets)}`;

const ledgerLines = (ledger: TaskLedgerSummary): string[] => [
  ledger.openTask === null
    ? '- No unit of work is open: taskStart opens one when the procedure takes an item up; an item the mission says to pass over gets no taskStart.'
    : `- Open unit of work: ${describeUnit(ledger.openTask)} at ${ledger.openTask.url} (a taskStart while it is open is skipped).`,
  ...(ledger.closed.length === 0
    ? ['- Closed this session: none yet.']
    : [
        '- Closed this session, oldest first:',
        ...ledger.closed.map((unit) => `  - ${describeUnit(unit)} — ${unit.outcome}`),
        ...(ledger.closedOmitted > 0 ? [`  (${ledger.closedOmitted} older not listed)`] : []),
      ]),
  // What the session refused stays said: the refusal's own objection is in one goal only.
  ...(ledger.refused.length === 0
    ? []
    : [
        '- Refused this session, on record — never taken up again:',
        ...ledger.refused.map(
          (unit) =>
            `  - ${describeIdentity(unit.facets)}${unit.note === '' ? '' : ` — ${unit.note}`}`,
        ),
        ...(ledger.refusedOmitted > 0 ? [`  (${ledger.refusedOmitted} older not listed)`] : []),
      ]),
  `- Closed so far: ${TASK_OUTCOMES.map((outcome) => `${outcome} ${ledger.counts[outcome]}`).join(' · ')}.${
    ledger.remainingTasks === null
      ? ''
      : ` Units that may still be started: ${ledger.remainingTasks} — one closed ${TASK_OUTCOMES.filter(
          (outcome) => !TASK_OUTCOME_SPENDS[outcome],
        ).join(' or ')} does not count.`
  }`,
  // The session's goal, as the engine counts it: the planner never has to end the session for it.
  ...(ledger.targetDone === null
    ? []
    : [
        `- Target: ${ledger.counts.done} of ${ledger.targetDone} closed done — the session ends complete when it is reached.`,
      ]),
];

/** A unit on record as the listing names it: its identity's values; the facts they are values of are said once per group (`factsOf`). */
const nameOf = (unit: UnitOnRecord): string =>
  unit.identity.map((facet) => quoted(facet.value)).join(' · ');
const factsOf = (unit: UnitOnRecord): string =>
  unit.identity.map((facet) => facet.name).join(' · ');

/**
 * The first units, in the order given, whose names — and the separators
 * between them — fit within the bytes the goal spends naming the record.
 */
const firstNamedWithin = (units: readonly UnitOnRecord[], bytes: number): UnitOnRecord[] => {
  let spent = 0;
  const shown: UnitOnRecord[] = [];
  for (const unit of units) {
    const cost = textBytes(nameOf(unit)) + (shown.length === 0 ? 0 : ', '.length);
    if (spent + cost > bytes) break;
    spent += cost;
    shown.push(unit);
  }
  return shown;
};

/** The units of one stance as lines: one per group of units that share the facts they are known by. */
const groupLines = (units: readonly UnitOnRecord[]): string[] => {
  const groups = new Map<string, string[]>();
  for (const unit of units) {
    const facts = factsOf(unit);
    groups.set(facts, [...(groups.get(facts) ?? []), nameOf(unit)]);
  }
  return [...groups].map(([facts, names]) => `  - by ${facts}: ${names.join(', ')}`);
};

/**
 * The units on record from earlier sessions, strongest stance first, each by
 * its identity's values — the facts it is known by named once for the group,
 * no note — so a record of the size measured fits whole in the bytes forty
 * lines with notes took, and the planner can keep off every unit on record
 * rather than the forty it was shown; past the bound the last units in the
 * advisor's order, weakest stance first to go, are counted, apart from what
 * the advisor itself left out. The bound is the
 * rendering's alone: the session holds a taskStart to every unit on record,
 * listed here or not (`refusedOnRecord`), and asks the advisor by identity for
 * one past the advice's bound, which the Limits say once (`onRecordLimit`);
 * the heading names the stance in a few words and repeats no rule.
 */
const onRecordLines = (onRecord: UnitsOnRecord): string[] => {
  if (onRecord.units.length === 0 && onRecord.omitted === 0) return [];
  /** Strongest first, then as the advisor ordered them: what is never started is what the planner must read first. */
  const ordered = UNIT_STANCES_STRONGEST_FIRST.flatMap((stance) =>
    onRecord.units.filter((unit) => unit.stance === stance),
  );
  const shown = firstNamedWithin(ordered, UNITS_ON_RECORD_BYTES_BOUND.target);
  const cut = ordered.length - shown.length;
  const lines = UNIT_STANCES_STRONGEST_FIRST.flatMap((stance) => {
    const units = shown.filter((unit) => unit.stance === stance);
    return units.length === 0
      ? []
      : [
          `- On record from earlier sessions ${UNIT_STANCE_ON_RECORD[stance]} (${UNIT_STANCE_MEANINGS[stance]}):`,
          ...groupLines(units),
        ];
  });
  return [
    ...lines,
    ...(cut > 0 ? [`  (${cut} more on record not listed)`] : []),
    // What the advisor counted past its own bound it did not name; the session asks it for each by identity.
    ...(onRecord.omitted > 0
      ? [
          `  (${onRecord.omitted} more on record the advisor counted and did not name — asked by identity at each taskStart)`,
        ]
      : []),
  ];
};

/** The whole Units of work section: this session's units, then the record's. */
export const unitsLines = (ledger: TaskLedgerSummary, onRecord: UnitsOnRecord): string[] => [
  ...ledgerLines(ledger),
  ...onRecordLines(onRecord),
];
