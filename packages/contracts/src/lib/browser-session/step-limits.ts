/**
 * The Limits a step goal states: what the validators refuse, said to the
 * model as rules, each beside the measurement that made it a rule. One
 * declared list rendered in order; a line about the mission's marks or stop
 * words appears only when the mission declares some.
 */
import { quoted } from '../text';
import type { Mark } from './mission-marks';
import type { StopOnPage } from './mission-stops';
import { ACTIONS_BOUND } from './step-plan.schema';

/** What the mission declared that a Limits line may depend on. */
export interface LimitFacts {
  marks: readonly Mark[];
  stops: readonly StopOnPage[];
}

interface Limit {
  /** Absent for a line every goal carries. */
  when?: (facts: LimitFacts) => boolean;
  line: (facts: LimitFacts) => string;
}

/** The marked words, and that a marked element is passed over. */
const marksLimit = (marks: readonly Mark[]): string =>
  `- An element marked ${marks.map((mark) => quoted(mark.token)).join(' or ')} carries a word the mission's Marks declare: it is passed over — never clicked, filled or selected, and never a unit of work.`;

/** The Limits line for the causes the mission ties to words: what each needs, and which of the words this page shows. */
const stopsLimit = (stops: readonly StopOnPage[]): string => {
  const needs = new Map<string, string[]>();
  for (const stop of stops) {
    needs.set(stop.cause, [...(needs.get(stop.cause) ?? []), quoted(stop.token)]);
  }
  const shown = [...new Set(stops.filter((stop) => stop.shown).map((stop) => quoted(stop.token)))];
  return `- A terminate is cut unless this page shows the words the mission ties to its cause — ${[...needs].map(([cause, tokens]) => `${cause} needs ${tokens.join(' or ')}`).join('; ')}. This page shows ${shown.length === 0 ? 'none of them' : shown.join(' and ')}.`;
};

const STEP_LIMITS: readonly Limit[] = [
  // A cap reads as a quota unless it says otherwise. Measured on 2026-10-06:
  // asked for "at most 8 actions", a producer returned seven or eight nearly
  // every time — planning the whole mission in one step, citing refs for
  // pages it had not opened yet, and being refused by the two validators
  // this section is describing. Saying it is a ceiling costs five words.
  {
    line: () =>
      `- At most ${ACTIONS_BOUND.target} actions, in the order they run — a ceiling the validators enforce, never a number to reach. A terminate or done action is last and appears nowhere else. A taskDone closes a unit of work and touches no page: the plan may go on from it — the next unit's click and taskStart included — but it comes before any action that could change the page.`,
  },
  // The `references` validator enforces exactly this, and the section that
  // exists to say what the validators enforce did not say it: an Elements
  // list belongs to one observation, so a plan that navigates and then cites
  // a ref is citing one that will not exist by the time it runs. And not only
  // what a plan may cite: what it may claim. A `taskDone` after a submit
  // names no ref and still asserts that a page nobody has observed says what
  // the plan hoped. Measured on 2026-10-06, five plans in eight closed their
  // unit of work and declared the mission complete on the far side of a
  // search they had not yet watched land.
  {
    line: () =>
      '- Cite refs only from the Elements list above, which belongs to this observation alone. An action that navigates, submits, or otherwise replaces the page is the LAST action of the plan: anything after it would act on, or claim something about, a page nobody has observed yet — closing a unit of work and terminating included. Plan up to it and leave the page it opens to the next plan.',
  },
  {
    line: () =>
      '- Never act on a disabled, not-visible or behind-the-dialog element; fill only what can be typed into; select only a listed option, or where the list counts more the page offers, one of those, verbatim.',
  },
  { line: () => '- A field the page hides is never filled or selected.' },
  // A claim rests on the page as observed. Measured 2026-10-07: twelve plans
  // closed their unit or ended the session past a click or a key press in
  // the same plan, one of them `done` after Next on page 1 of 9 of a form.
  {
    line: () =>
      '- A taskStart, taskDone or terminate claims what this page shows: it comes before any navigate, click, fill, select, press or askFields, never after.',
  },
  { when: ({ marks }) => marks.length > 0, line: ({ marks }) => marksLimit(marks) },
  { when: ({ stops }) => stops.length > 0, line: ({ stops }) => stopsLimit(stops) },
  // The page already answered a repeated question. Measured 2026-10-08: nine
  // steps of 31 re-clicked the one card the pane already showed.
  {
    line: () =>
      '- On a page unchanged since the last plan, an action that ran at the last step — the same kind on the same element by role and name, with the same value, option, key or URL — is cut: the page already answered it. Act on another element this page lists, press a different key, scroll, or open or close the unit of work from what the page shows now.',
  },
  { line: () => '- Validators check these limits; they are not criteria.' },
];

/** The Limits section's lines for this goal, in declared order. */
export const limitsLines = (facts: LimitFacts): string[] =>
  STEP_LIMITS.filter((limit) => limit.when?.(facts) ?? true).map((limit) => limit.line(facts));
