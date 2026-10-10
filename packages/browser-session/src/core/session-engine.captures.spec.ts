import type { CapturePolicy } from './engine-context';
import type { CaptureRecord } from './session-dump';
import {
  decidedAnswers,
  decidedPlan,
  FakeBrowser,
  refusing,
  type InMemoryDumpStore,
} from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_SEQUENCE,
  journeyPages as pages,
} from './testing-journey';
import { NO_CAPTURE, runScripted as run } from './testing-session';

/**
 * What a session images beside each step's own screenshot, as its capture
 * policy says: the actions it names once they ran, a refused one when it asks,
 * a field entry outlined — and the value entered only ever in `captures.json`.
 */
const ENTRIES: CapturePolicy = { after: ['fill', 'select'], failures: true };
const EVERY: CapturePolicy = {
  after: ['click', 'fill', 'select', 'press', 'scroll'],
  failures: true,
};

const journey = (capture: CapturePolicy, browser = new FakeBrowser(pages())) =>
  run({
    script: {
      plans: JOURNEY_SEQUENCE.map((p) => decidedPlan(p)),
      answers: [decidedAnswers(ANSWERS)],
    },
    replies: [{ kind: 'answer', text: 'Yes' }],
    capture,
    browser,
  });

/** A step's captures as its list names them: file, kind, outcome; and whether each image is in the dump. */
const listed = (dumps: InMemoryDumpStore, step: string): [string, string, string][] => {
  const path = `01-steps/${step}/captures.json`;
  if (!dumps.files.has(path)) return [];
  const records = JSON.parse(dumps.text(path)) as CaptureRecord[];
  for (const record of records)
    expect(dumps.files.has(`01-steps/${step}/${record.file}`)).toBe(true);
  return records.map((record) => [record.file, record.kind, record.outcome]);
};

describe('what a session images beside each step', () => {
  it('[BRW-9] images every field entry once it ran, outlined, and lists it — the value in the list, never in a file name', async () => {
    const { dumps, browser } = await journey(ENTRIES);
    // The search box the plan filled itself is an entry like any other; its click is not imaged.
    expect(listed(dumps, '01')).toEqual([['captures/01-fill-search.png', 'fill', 'ok']]);
    expect(listed(dumps, '02')).toEqual([]);
    // The form: the memory's fill and the operator's choice; the hidden field left blank entered nothing.
    expect(listed(dumps, '03')).toEqual([
      ['captures/01-fill-years-of-experience-with-python.png', 'fill', 'ok'],
      ['captures/02-select-work-authorisation.png', 'select', 'ok'],
    ]);
    const records = JSON.parse(dumps.text('01-steps/03/captures.json')) as CaptureRecord[];
    expect(records.map((record) => record.label)).toEqual([
      'fill textbox "Years of experience with Python" with "6"',
      'select "Yes" in combobox "Work authorisation"',
    ]);
    // Each step's own screenshot marks nothing; each entry marks the field it filled.
    expect(browser.shots).toEqual([null, 'e1', null, null, 'e1', 'e2', null, null]);
  });

  it('[BRW-9] every action the policy names is imaged, a click unmarked, and a profile that names none images nothing past the step screenshot', async () => {
    const every = await journey(EVERY);
    expect(listed(every.dumps, '01')).toEqual([
      ['captures/01-fill-search.png', 'fill', 'ok'],
      ['captures/02-click-search.png', 'click', 'ok'],
    ]);
    expect(listed(every.dumps, '02')).toEqual([
      ['captures/01-click-senior-engineer-acme.png', 'click', 'ok'],
    ]);
    expect(listed(every.dumps, '03').map(([file]) => file)).toEqual([
      'captures/01-fill-years-of-experience-with-python.png',
      'captures/02-select-work-authorisation.png',
      'captures/03-click-next.png',
    ]);
    expect(every.browser.shots.filter((ref) => ref !== null)).toEqual(['e1', 'e1', 'e2']);

    const none = await journey(NO_CAPTURE);
    expect([...none.dumps.files.keys()].some((path) => path.includes('captures'))).toBe(false);
    expect(none.browser.shots.every((ref) => ref === null)).toBe(true);
  });

  it('[BRW-9] images an entry the page refused, as the page stood, only when the policy asks for refusals', async () => {
    const refused = await journey(ENTRIES, refusing(new FakeBrowser(pages()), 'fill', 'form'));
    expect(listed(refused.dumps, '03')).toEqual([
      ['captures/01-fill-years-of-experience-with-python.png', 'fill', 'failed'],
    ]);
    const quiet = await journey(
      { after: ['fill', 'select'], failures: false },
      refusing(new FakeBrowser(pages()), 'fill', 'form'),
    );
    expect(listed(quiet.dumps, '03')).toEqual([]);
  });
});
