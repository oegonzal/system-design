import {
  EVIDENCE_TEXT_MAX_LENGTH,
  FIELD_ANSWER_PIPELINE_ID,
  GOAL_BUDGET_BYTES,
  GoalBudgetExceeded,
  heaviestRecordedFields,
  MAX_EVIDENCE,
  MISSION_WITH_CONTEXT,
  readEvidenceItems,
  textBytes,
  type EvidenceItem,
  type FieldSpec,
} from '@sysdesign/contracts';
import { FakeLoop, FakeLoopClient } from '@sysdesign/studio-testing';

import { unitContextOf, type FormTask } from '../../core/open-unit';
import type { FieldsInput } from '../../core/ports';
import { composeFieldGoalWithinBudget } from '../loop-http/render-goal';
import { judgeFields } from './judged-form';
import { ANSWERS, BRAIN_SETTINGS, completeRuns, CRITERIA, field, SESSION } from './testing';

/**
 * The goal a form page is judged on, fitted to the loop's budget with the
 * evidence first: the unit's statement yields to the fields and to every item
 * recalled, and an item is dropped only when the evidence does not fit even
 * beside no statement at all.
 */
const LINES = Array.from({ length: 400 }, (_, at) => `${at} `.padEnd(100, 'x'));
const STATEMENT = unitContextOf(LINES, 'main');
const TITLE = 'What the page laid out under its main landmark as the unit opened';
const TASK: FormTask = {
  label: 'Senior Engineer at Acme',
  url: 'https://jobs.example.test/apply/42',
  facets: [{ name: 'company', value: 'Acme' }],
  unitKey: 'company=acme',
  context: STATEMENT,
};
/** Less than two of the statement's lines: the ladder keeps every whole line that fits, its title moving by a few digits. */
const SLACK = 2 * (textBytes(LINES[0] ?? '') + 1);

/** One recalled item, its text cut at an item's bound. */
const item = (at: number): EvidenceItem => ({
  alias: `m${at + 1}`,
  text: `${at}. ${'Alex Example — a fact recalled for the page, with the figures on record. '.repeat(20)}`
    .slice(0, EVIDENCE_TEXT_MAX_LENGTH)
    .trimEnd(),
  when: '2026-10-30',
  scope: 'subject',
  kind: BRAIN_SETTINGS.legend[0]?.kind ?? 'profile_fact',
  source: { origin: 'memory-ingest:notes', ref: `r-${at}@v1` },
});
const EVIDENCE = Array.from({ length: MAX_EVIDENCE }, (_, at) => item(at));
const ALIASES = EVIDENCE.map(({ alias }) => alias);

/** A select listing as many options as an observation keeps, each one long. */
const longList = (ref: string): FieldSpec =>
  field(ref, `Which option is yours (${ref})?`, {
    role: 'combobox',
    options: Array.from({ length: 300 }, (_, at) => `Option ${at} `.padEnd(70, '.')),
  });

const pageOf = (fields: FieldSpec[]): FieldsInput => ({
  session: SESSION,
  mission: MISSION_WITH_CONTEXT,
  task: TASK,
  fields,
  criteria: CRITERIA,
});

async function judgedGoal(input: FieldsInput) {
  const loop = new FakeLoop({ now: () => new Date().toISOString() });
  const judged = await judgeFields(
    new FakeLoopClient(loop),
    FIELD_ANSWER_PIPELINE_ID,
    input,
    EVIDENCE,
    BRAIN_SETTINGS.legend,
    SESSION,
    'form page',
    { pollEveryMs: 0, sleep: async () => completeRuns(ANSWERS)(loop) },
  );
  const goal = loop.startRequests[0]?.goal ?? '';
  return { goal, listed: judged.listed, ...judged.composition };
}

describe('the goal a form page is judged on', () => {
  it('[BRW-21] gives every item recalled its room before the unit’s statement: the statement is cut only as far as the fields and the evidence need', async () => {
    const { goal, listed, rung, bytes } = await judgedGoal(pageOf(heaviestRecordedFields()));
    expect(readEvidenceItems(goal).map(({ alias }) => alias)).toEqual(ALIASES);
    expect(listed).toBe(EVIDENCE.length);
    expect(rung).toBe('statement-cut');
    expect(bytes).toBe(textBytes(goal));
    expect(bytes).toBeLessThanOrEqual(GOAL_BUDGET_BYTES);
    expect(GOAL_BUDGET_BYTES - bytes).toBeLessThan(SLACK);
    // The statement keeps the page's first words, cut at a node boundary.
    expect(goal).toContain(`\n${LINES[0]}\n`);
    expect(goal).not.toContain(LINES[LINES.length - 1] ?? 'never');
  });

  it('[BRW-21] drops the lowest-ranked items only when the evidence does not fit even beside no statement, the best-ranked kept in their order and the room left the statement’s', async () => {
    const page = pageOf([longList('e1'), field('e2', 'Email')]);
    const { goal, listed, bytes } = await judgedGoal(page);
    const aliases = readEvidenceItems(goal).map(({ alias }) => alias);
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.length).toBeLessThan(EVIDENCE.length);
    expect(aliases).toEqual(ALIASES.slice(0, aliases.length));
    expect(listed).toBe(aliases.length);
    // One item more would not fit even with no line of the statement…
    const oneMore = {
      evidence: EVIDENCE.slice(0, aliases.length + 1),
      kinds: BRAIN_SETTINGS.legend,
    };
    expect(() =>
      composeFieldGoalWithinBudget(FIELD_ANSWER_PIPELINE_ID, page, GOAL_BUDGET_BYTES, oneMore),
    ).toThrow(GoalBudgetExceeded);
    // …and the room it leaves goes to the statement, titled as ever.
    expect(goal).toContain(TITLE);
    expect(bytes).toBeLessThanOrEqual(GOAL_BUDGET_BYTES);
    expect(GOAL_BUDGET_BYTES - bytes).toBeLessThan(SLACK);
  });
});
