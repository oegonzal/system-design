import {
  MISSION_FIXTURE,
  MISSION_WITH_DOCUMENTS,
  observedElement,
  type StepPlan,
} from '@sysdesign/contracts';

import {
  decidedAnswers,
  decidedPlan,
  FakeBrowser,
  InMemoryDumpStore,
  InMemoryLedger,
  type ScriptedPage,
} from './testing';
import {
  JOURNEY_ANSWERS as ANSWERS,
  JOURNEY_PLANS as PLANS,
  journeyPages as pages,
} from './testing-journey';
import { runScripted as run } from './testing-session';
import { SessionRefused } from './unit-advice';

/**
 * The documents a mission declares, through the engine: the files handed to
 * the browser by name, an upload into the form's hidden file control, and the
 * refusals before any row when the files and the declarations disagree.
 */
const RESUME = { name: 'resume', path: '/somewhere/resume.pdf' };

/** The journey whose form holds a file control the page hides, as employer forms do. */
const pagesWithFileControl = (): ScriptedPage[] =>
  pages().map((page) =>
    page.id === 'form'
      ? {
          ...page,
          observation: {
            ...page.observation,
            elements: [
              ...page.observation.elements,
              observedElement('f1', 'button', 'Attach résumé', {
                kind: 'uploadable',
                inputType: 'file',
                visible: false,
              }),
            ],
          },
        }
      : page,
  );

const formWithUpload: StepPlan = {
  ...PLANS.form,
  actions: [
    {
      kind: 'upload',
      ref: 'f1',
      document: 'resume',
      reason: 'the form requires a résumé',
      expect: null,
      serves: [],
    },
    ...PLANS.form.actions,
  ],
};

describe('the session engine and the documents a mission declares', () => {
  it('[BRW-26] hands the supplied files to the browser by name and uploads one into the form, the history naming the document and never its path', async () => {
    const browser = new FakeBrowser(pagesWithFileControl());
    const { outcome, brain } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, formWithUpload, PLANS.done, PLANS.end].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      lines: ['Yes'],
      browser,
      mission: MISSION_WITH_DOCUMENTS,
      documents: [RESUME],
    });
    expect(outcome.status).toBe('complete');
    expect(browser.opened?.documents).toEqual([RESUME]);
    expect(browser.calls).toContain('upload f1');
    const history = brain.planInputs[3]?.history ?? [];
    expect(history.map((h) => [h.action, h.outcome])).toContainEqual([
      'upload "resume" into button "Attach résumé"',
      'ok',
    ]);
    expect(JSON.stringify(brain.planInputs)).not.toContain(RESUME.path);
  });

  it('[BRW-26] refuses before any row a declared document with no file, a supplied file no section declares, and a name supplied twice', async () => {
    const script = { plans: [], answers: [] };
    const refused = async (
      mission: string,
      documents: (typeof RESUME)[],
    ): Promise<{ error: unknown; ledger: InMemoryLedger; dumps: InMemoryDumpStore }> => {
      const ledger = new InMemoryLedger();
      const dumps = new InMemoryDumpStore();
      const error: unknown = await run({ script, mission, documents, ledger, dumps }).then(
        () => null,
        (failure: unknown) => failure,
      );
      return { error, ledger, dumps };
    };
    for (const [mission, documents, words] of [
      [MISSION_WITH_DOCUMENTS, [], /supplies no file for it/],
      [MISSION_FIXTURE, [RESUME], /declares no document for/],
      [MISSION_WITH_DOCUMENTS, [RESUME, RESUME], /supplied twice/],
    ] as const) {
      const { error, ledger, dumps } = await refused(mission, [...documents]);
      expect(error).toBeInstanceOf(SessionRefused);
      expect(String((error as Error).message)).toMatch(words);
      expect(ledger.sessions.size).toBe(0);
      expect(dumps.opened).toBe(0);
    }
  });

  it('[BRW-26] runs a mission declaring no document with none supplied, as every session did before', async () => {
    const { outcome, browser } = await run({
      script: {
        plans: [PLANS.search, PLANS.results, PLANS.form, PLANS.done, PLANS.end].map((p) =>
          decidedPlan(p),
        ),
        answers: [decidedAnswers(ANSWERS)],
      },
      lines: ['Yes'],
    });
    expect(outcome.status).toBe('complete');
    expect(browser.opened?.documents).toEqual([]);
  });
});
