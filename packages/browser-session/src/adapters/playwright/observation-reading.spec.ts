import { ELEMENTS_BOUND, SNAPSHOT_BOUND, type PageObservation } from '@sysdesign/contracts';

import type { SnapshotNode } from './aria-snapshot';
import type { ElementFacts } from './element-facts';
import { toObservation, toObservedElement, type PageReading } from './observation-reading';

/** The facts a plain, visible, enabled control reads as. */
const facts = (overrides: Partial<ElementFacts> = {}): ElementFacts => ({
  inputType: null,
  value: null,
  options: null,
  required: false,
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
  elements: [],
  unreadElements: 0,
  unreadSnapshotLines: 0,
  focusedScope: null,
  ...overrides,
});

const dialog = { role: 'dialog' as const, name: 'Apply to Acme' };
const READ = { reads: 2, settled: true, durationMs: 850 };

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
    expect(observation.snapshotRung).toBe('nodes-only');
    expect(observation.elements).toHaveLength(ELEMENTS_BOUND.target);
    expect(observation.omittedElements).toBe(7);
  });
});
