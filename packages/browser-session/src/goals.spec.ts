import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeStepGoal,
  emptyLedger,
  formObservation,
  TASK_OUTCOMES,
  TERMINATE_CAUSES,
} from '@sysdesign/contracts';

/**
 * The goals are the only place a site may be named. These specs hold the
 * package to that, and hold each goal to the template the deriver personas
 * read by heading name.
 */
const GOALS_DIR = join(__dirname, '..', 'goals');
const SRC_DIR = __dirname;

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

/** The site names the shipped goals carry; none may appear under `src/`. */
const SITE_WORDS = ['linkedin', 'duckduckgo'];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const goals = readdirSync(GOALS_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(join(GOALS_DIR, name), 'utf8') }));

describe('the goals', () => {
  it('[BRW-8] names no site anywhere under src — the mission lives in the goal and the same program runs any goal', () => {
    const offenders = files(SRC_DIR)
      .filter((path) => !path.endsWith('goals.spec.ts'))
      .filter((path) => {
        const text = readFileSync(path, 'utf8').toLowerCase();
        return SITE_WORDS.some((word) => text.includes(word));
      })
      .map((path) => path.slice(SRC_DIR.length + 1));
    expect(offenders).toEqual([]);
    expect(goals.map((goal) => goal.name).sort()).toEqual([
      'linkedin-easy-apply.md',
      'smoke-search.md',
    ]);
  });

  it.each(goals.map((goal) => [goal.name, goal.text] as const))(
    '[BRW-8] %s carries every template heading, speaks the cause and outcome words, and composes under the budget',
    (_name, text) => {
      for (const heading of TEMPLATE_HEADINGS) {
        expect(`\n${text}`, `missing ${heading}`).toContain(`\n${heading}\n`);
      }
      const stops = text.slice(text.indexOf('## Stop conditions'), text.indexOf('## Never do'));
      const causes = [...stops.matchAll(/^- ([a-z-]+):/gm)].map((match) => match[1]);
      expect(causes.length).toBeGreaterThan(0);
      for (const cause of causes) expect(TERMINATE_CAUSES).toContain(cause);
      expect(causes).toContain('mission-complete');
      const events = text.slice(text.indexOf('## Task events'));
      const outcomes = [...events.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]);
      const spoken = outcomes.filter((word) => (TASK_OUTCOMES as readonly string[]).includes(word));
      expect(spoken).toContain('done');
      for (const word of outcomes.filter(
        (w) => !(TERMINATE_CAUSES as readonly string[]).includes(w),
      ))
        expect(TASK_OUTCOMES).toContain(word);
      expect(() =>
        composeStepGoal({
          mission: text,
          observation: formObservation(),
          history: [],
          ledger: emptyLedger(),
          objections: [],
          progress: { criteria: [], settled: [], done: [] },
          pageUnchanged: false,
        }),
      ).not.toThrow();
    },
  );
});
