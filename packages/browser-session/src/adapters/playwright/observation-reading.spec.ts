import {
  ELEMENTS_BOUND,
  OPTIONS_BOUND,
  SNAPSHOT_BOUND,
  type PageObservation,
} from '@sysdesign/contracts';

import type { SnapshotNode } from '../../core/snapshot/aria-snapshot';
import type { ElementFacts } from './element-facts';
import {
  toObservation,
  toObservedElement,
  type PageReading,
  mainUnrendered,
} from './observation-reading';

/** The facts a plain, visible, enabled control reads as. */
const facts = (overrides: Partial<ElementFacts> = {}): ElementFacts => ({
  inputType: null,
  value: null,
  options: null,
  required: false,
  invalid: false,
  disabled: false,
  visible: true,
  maxLength: null,
  hiddenTraits: [],
  context: null,
  nameHint: null,
  modal: false,
  text: '',
  ...overrides,
});

const node = (ref: string, role: string, name: string | null, depth = 1): SnapshotNode => ({
  depth,
  role,
  name,
  ref,
  attributes: { ref },
  inline: null,
});

const reading = (overrides: Partial<PageReading> = {}): PageReading => ({
  url: 'https://jobs.example.test/search',
  title: 'Jobs',
  snapshot: '- generic [ref=e1]:\n  - button "Easy Apply" [ref=e2]',
  nodes: [],
  elements: [],
  fileControls: [],
  choiceBoxes: [],
  unreadElements: 0,
  unreadSnapshotLines: 0,
  focusedScope: null,
  scopeBusy: false,
  busyRead: { scopes: 0, seen: [], unseen: 0 },
  landmarks: [],
  ...overrides,
});

const dialog = { role: 'dialog' as const, name: 'Apply to Acme' };
const READ = { reads: 2, settled: true, durationMs: 850, busy: [] };

describe('one reading as an observation', () => {
  it('[BRW-2] names an element by the tree, else by its name or id attribute, and keeps what a person reads on an unnamed one apart as text', () => {
    expect(
      toObservedElement(
        node('e2', 'button', 'Easy Apply'),
        facts({ text: 'Easy Apply' }),
        null,
        'Easy Apply',
      ),
    ).toMatchObject({
      name: 'Easy Apply',
      text: null,
      scope: null,
      landmark: null,
    });
    // Unnamed: the words beneath it in the tree come first, the DOM's rendering second.
    expect(
      toObservedElement(node('e5', 'link', null), facts(), null, 'Senior Engineer Acme'),
    ).toMatchObject({
      name: '',
      text: 'Senior Engineer Acme',
    });
    expect(
      toObservedElement(
        node('e3', 'button', null),
        facts({ nameHint: 'search', text: 'Describe the job you want' }),
        null,
        '',
      ),
    ).toMatchObject({ name: 'search', text: 'Describe the job you want' });
    // Nothing beneath it and nothing rendered: honestly nothing.
    expect(toObservedElement(node('e4', 'button', null), facts(), null, '')).toMatchObject({
      name: '',
      text: null,
    });
    // The scope travels with the DOM's word on whether it is modal.
    expect(
      toObservedElement(
        node('e14', 'textbox', 'First name', 2),
        facts({ modal: true }),
        dialog,
        '',
      ),
    ).toMatchObject({ scope: { role: 'dialog', name: 'Apply to Acme', modal: true } });
  });

  it('[BRW-2] keeps a select to the options bound and counts the rest, and carries the page’s invalid mark', () => {
    const many = Array.from({ length: OPTIONS_BOUND.target + 5 }, (_, i) => `option ${i + 1}`);
    const long = toObservedElement(
      node('e7', 'combobox', 'Country'),
      facts({ options: many, invalid: true }),
      null,
      '',
    );
    expect(long.options).toHaveLength(OPTIONS_BOUND.target);
    expect(long).toMatchObject({ optionsOmitted: 5, invalid: true });
    expect(
      toObservedElement(node('e8', 'combobox', 'Few'), facts({ options: ['a'] }), null, ''),
    ).toMatchObject({ optionsOmitted: 0, invalid: false });
  });

  it('[BRW-2] puts the modal scope in front, orders what is inside it first, and reports the snapshot rung as data', () => {
    const inside = (ref: string, name: string) =>
      toObservedElement(node(ref, 'button', name, 2), facts({ modal: true }), dialog, '');
    const cookies = { role: 'dialog' as const, name: 'Cookies' };
    const elements = [
      toObservedElement(node('e2', 'button', 'Easy Apply'), facts(), null, ''),
      toObservedElement(node('e8', 'button', 'Accept cookies', 2), facts(), cookies, ''),
      inside('e15', 'Next'),
      toObservedElement(
        node('e9', 'link', 'Hidden'),
        facts({ visible: false, hiddenTraits: ['offscreen'] }),
        null,
        '',
      ),
      inside('e16', 'Dismiss'),
    ];
    const observation = toObservation(reading({ elements }), READ);
    expect(observation.activeScope).toEqual({ role: 'dialog', name: 'Apply to Acme' });
    expect(observation.elements.map((e) => e.ref)).toEqual(['e15', 'e16', 'e2', 'e8', 'e9']);
    expect(observation.snapshotRung).toBe('full');
    expect(observation.omittedElements).toBe(0);

    // Two modal scopes: the one holding the focused node wins; else the last in document order.
    const other = { role: 'alertdialog' as const, name: 'Session expired' };
    const twoModals = [
      ...elements,
      toObservedElement(
        node('e20', 'button', 'Sign in again', 2),
        facts({ modal: true }),
        other,
        '',
      ),
    ];
    expect(toObservation(reading({ elements: twoModals }), READ).activeScope).toEqual(other);
    expect(
      toObservation(reading({ elements: twoModals, focusedScope: dialog }), READ).activeScope,
    ).toEqual(dialog);
    // A non-modal dialog alone opens no scope.
    expect(toObservation(reading({ elements: elements.slice(0, 2) }), READ).activeScope).toBeNull();
  });

  it('[BRW-2] reduces a snapshot past the observation bound by rung rather than refusing the page, and counts the elements past the cap', () => {
    const lines = Array.from(
      { length: 2_000 },
      (_, i) => `- paragraph [ref=e${i}]: ${'words '.repeat(12)}`,
    );
    const huge = reading({
      snapshot: lines.join('\n'),
      elements: Array.from({ length: ELEMENTS_BOUND.target + 7 }, (_, i) =>
        toObservedElement(node(`e${i}`, 'link', `Result ${i}`), facts(), null, ''),
      ),
    });
    const observation: PageObservation = toObservation(huge, READ);
    expect(observation.reading).toEqual(READ);
    expect(Buffer.byteLength(observation.ariaSnapshot, 'utf8')).toBeLessThanOrEqual(
      SNAPSHOT_BOUND.target,
    );
    // Every line carries words, so the words are cut where the bound ends rather than dropped.
    expect(observation.snapshotRung).toBe('words-cut');
    expect(observation.ariaSnapshot).toContain('- paragraph [ref=e0]: words');
    expect(observation.elements).toHaveLength(ELEMENTS_BOUND.target);
    expect(observation.omittedElements).toBe(7);
  });

  it('[BRW-2] keeps an open dialog whole when the snapshot is cut, modal or not, and a non-modal one blocks nothing', () => {
    // Measured 2026-10-10: the dialog confirming an application was sent
    // carried no aria-modal and sat last in the snapshot, and the cut dropped it.
    const page = Array.from(
      { length: 2_000 },
      (_, i) => `- paragraph [ref=e${i}]: ${'words '.repeat(12)}`,
    );
    const confirmation = [
      '- dialog [ref=e5000]:',
      '  - button "Not now" [ref=e5001]',
      '  - heading "Your application was sent to Acme!" [level=3] [ref=e5002]',
    ];
    const sent = { role: 'dialog' as const, name: '' };
    const observation = toObservation(
      reading({
        snapshot: [...page, ...confirmation].join('\n'),
        elements: [
          toObservedElement(node('e1', 'link', 'Result 1'), facts(), null, ''),
          toObservedElement(node('e5001', 'button', 'Not now', 2), facts(), sent, ''),
        ],
      }),
      READ,
    );
    expect(observation.activeScope).toBeNull();
    expect(observation.snapshotRung).toBe('scope');
    expect(observation.ariaSnapshot).toContain('Your application was sent to Acme!');
    expect(observation.elements.map((e) => e.ref)).toEqual(['e1', 'e5001']);
  });

  it('[BRW-2] puts the main landmark\u2019s elements first under the cap, and says when main has rendered nothing', () => {
    // Measured 2026-10-08: three observations of a results page read settled
    // with 33 elements of banner, navigation and search box and a main with
    // nothing in it; the plans made on them were wasted.
    const inBanner = toObservedElement(node('e2', 'link', 'Home'), facts(), null, '', 'banner');
    const inMain = toObservedElement(node('e8', 'button', 'Easy Apply'), facts(), null, '', 'main');
    const stray = toObservedElement(node('e11', 'button', 'Stray'), facts(), null, '');
    expect(inMain.landmark).toBe('main');
    expect(stray.landmark).toBeNull();
    const chromeFirst = reading({
      elements: [inBanner, stray, inMain],
      landmarks: ['banner', 'main'],
    });
    expect(
      toObservation(chromeFirst, { reads: 1, settled: true, durationMs: 0, busy: [] }).elements.map(
        (e) => e.ref,
      ),
    ).toEqual(['e8', 'e2', 'e11']);
    expect(mainUnrendered(chromeFirst)).toBe(false);
    // A tree with a main and no element in it has not rendered its content yet.
    expect(
      mainUnrendered(reading({ elements: [inBanner, stray], landmarks: ['banner', 'main'] })),
    ).toBe(true);
    // A page laid out without a main landmark is judged on what it shows.
    expect(mainUnrendered(reading({ elements: [inBanner, stray], landmarks: ['banner'] }))).toBe(
      false,
    );
  });
});
