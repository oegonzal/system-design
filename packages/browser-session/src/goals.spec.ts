import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeStepGoal,
  formObservation,
  marksOf,
  stopsOf,
  TASK_OUTCOMES,
  stepGoalInput,
} from '@sysdesign/contracts';

/**
 * Each goal is held to the template the deriver personas read by heading
 * name. That no site or line of work is named outside a goal is held across
 * the engine by `tooling/site-words.spec.ts`.
 */
const GOALS_DIR = join(__dirname, '..', 'goals');

/** The headings the browser-step and field-answer derivers reference by name. */
const TEMPLATE_HEADINGS = [
  '# Mission',
  '## Unit of work',
  '## Per-unit procedure',
  '## Answering policy',
  '## Stop conditions',
  '## Never do',
  '## Task events',
];

const goals = readdirSync(GOALS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(join(GOALS_DIR, name), 'utf8') }));

describe('the goals', () => {
  it('[BRW-8] are markdown files beside the program, at least one', () => {
    expect(goals.length).toBeGreaterThan(0);
  });

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
      const events = text.slice(text.indexOf('## Task events'));
      const outcomes = [...events.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]);
      const spoken = outcomes.filter((word) => (TASK_OUTCOMES as readonly string[]).includes(word));
      expect(spoken).toContain('done');
      for (const word of outcomes.filter((w) => !causes.includes(w)))
        expect(TASK_OUTCOMES).toContain(word);
      expect(() =>
        composeStepGoal(stepGoalInput({ mission: text, observation: formObservation() })),
      ).not.toThrow();
    },
  );
});
