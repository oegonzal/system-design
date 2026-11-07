import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  advisorsOf,
  documentNamesOf,
  composeFieldGoal,
  composeStepGoal,
  FIELD_ANSWER_PIPELINE_ID,
  formObservation,
  heaviestRecordedFields,
  marksOf,
  stopsOf,
  TASK_OUTCOMES,
  stepGoalInput,
  unitContextLandmarkOf,
  unitFacetsOf,
} from '@sysdesign/contracts';

import { renderFieldProse } from './adapters/loop-http/render-goal';
import { UNIT_CONTEXT_MAX_BYTES, unitContextOf } from './core/open-unit';

/**
 * Each goal is held to the template the deriver personas read by heading
 * name. That no site or line of work is named outside a goal is held across
 * the engine by `tooling/site-words.spec.ts`.
 */
const GOALS_DIR = join(__dirname, '..', 'goals');

/** The headings the browser-step, field-answer and answer-suggestions derivers reference by name. */
const TEMPLATE_HEADINGS = [
  '# Mission',
  '## Unit of work',
  '## Per-unit procedure',
  '## Answering policy',
  '## Suggesting policy',
  '## Stop conditions',
  '## Never do',
  '## Task events',
];

/**
 * The owner's answering boundary, declared 2026-11-07 with his wish that forms
 * be answered as loosely as the record allows: the values no policy line may
 * name, which come from the record or the operator alone.
 */
const ANSWERING_BOUNDARY =
  'No line of this policy names a value for a name, a contact detail, an address, a date, an identifier, an answer about criminal history, nor any equal-opportunity answer but declining: those come from the record or the operator.';

const goals = readdirSync(GOALS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(join(GOALS_DIR, name), 'utf8') }));

describe('the goals', () => {
  it('[BRW-8] are markdown files beside the program, at least one', () => {
    expect(goals.length).toBeGreaterThan(0);
  });

  it.each(goals.map((goal) => [goal.name, goal.text] as const))(
    '[BRW-8] %s keeps the answering boundary in its Answering policy',
    (_name, text) => {
      const policy = text.slice(
        text.indexOf('\n## Answering policy\n'),
        text.indexOf('\n## Suggesting policy\n'),
      );
      expect(policy).toContain(ANSWERING_BOUNDARY);
    },
  );

  it.each(goals.map((goal) => [goal.name, goal.text] as const))(
    '[BRW-8] %s carries every template heading, speaks the cause and outcome words, and composes under the budget',
    (_name, text) => {
      for (const heading of TEMPLATE_HEADINGS) {
        expect(`\n${text}`, `missing ${heading}`).toContain(`\n${heading}\n`);
      }
      // The Stop conditions read whole as the grammar the engine checks them by:
      // a cause word, the words the page shows when it holds, the meaning.
      const stops = stopsOf(text);
      expect(stops.length).toBeGreaterThan(0);
      // A mission declares how it completes: some stop of its own ends the session complete.
      expect(stops.some((stop) => stop.ending === 'complete')).toBe(true);
      const causes: readonly string[] = stops.map((stop) => stop.cause);
      // A Marks section, when a goal has one, reads whole: a mark nobody reads is a trap.
      expect(() => marksOf(text)).not.toThrow();
      // So do a Unit identity, a Unit context and an Advisors section: a fact, a landmark or an advisor nobody
      // reads is a record nobody keeps.
      expect(() => unitFacetsOf(text)).not.toThrow();
      expect(() => unitContextLandmarkOf(text)).not.toThrow();
      expect(() => advisorsOf(text)).not.toThrow();
      // And a Documents section: a document nobody can name is a file nobody can supply.
      expect(() => documentNamesOf(text)).not.toThrow();
      // A goal that asks an advisor declares what a unit is known by, or the advisor would have nothing to answer about.
      if (advisorsOf(text).length > 0) expect(unitFacetsOf(text).length).toBeGreaterThan(0);
      const events = text.slice(text.indexOf('## Task events'));
      const outcomes = [...events.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]);
      const spoken = outcomes.filter((word) => (TASK_OUTCOMES as readonly string[]).includes(word));
      expect(spoken).toContain('done');
      for (const word of outcomes.filter((w) => !causes.includes(w)))
        expect(TASK_OUTCOMES).toContain(word);
      expect(() =>
        composeStepGoal(stepGoalInput({ mission: text, observation: formObservation() })),
      ).not.toThrow();
      // A statement at its bound beside the heaviest field list of the 2026-10-14 measure composes whole with
      // this goal and no evidence, so the codec alone is asked here, with no ladder to catch it; the room
      // evidence takes is the brain's ladder's to make, cutting the statement first (`judged-form.spec.ts`).
      const landmark = unitContextLandmarkOf(text);
      if (landmark !== null) {
        const context = unitContextOf(['x'.repeat(UNIT_CONTEXT_MAX_BYTES)], landmark);
        const task = {
          label: 'Unit',
          url: 'https://example.test/unit',
          facets: [],
          unitKey: 'unit-1',
          context,
        };
        expect(() =>
          composeFieldGoal({
            pipeline: FIELD_ANSWER_PIPELINE_ID,
            prose: renderFieldProse({ mission: text, task }),
            fields: heaviestRecordedFields(),
            evidence: [],
            kinds: [],
            unitKey: task.unitKey,
          }),
        ).not.toThrow();
      }
    },
  );
});
