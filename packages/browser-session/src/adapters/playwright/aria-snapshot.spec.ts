import { decodeAriaSnapshot, fitSnapshot } from './aria-snapshot';

const SNAPSHOT = `- banner [ref=e1]:
  - link "Home" [ref=e2]:
    - /url: /
- heading "Jobs" [level=1] [ref=e3]
- searchbox "Search by title" [ref=e4]
- button "Search" [ref=e5]
- combobox "Work authorisation" [required] [ref=e6]:
  - option "Yes" [selected]
  - option "No"
- button "Save search" [disabled] [ref=e7]
- textbox "Say \\"hi\\"" [ref=e8]
- text: Some prose the page shows
- checkbox "Remote only" [checked] [active] [ref=e9]
- generic [ref=e10]:
  - paragraph: nothing interactive here
`;

describe('the aria snapshot decoder', () => {
  it('[BRW-2] reads every node with the ref Playwright minted, its role, name and attributes, and skips property and text lines', () => {
    const nodes = decodeAriaSnapshot(SNAPSHOT);
    expect(nodes.map((node) => [node.ref, node.role, node.name])).toEqual([
      ['e1', 'banner', null],
      ['e2', 'link', 'Home'],
      ['e3', 'heading', 'Jobs'],
      ['e4', 'searchbox', 'Search by title'],
      ['e5', 'button', 'Search'],
      ['e6', 'combobox', 'Work authorisation'],
      [null, 'option', 'Yes'],
      [null, 'option', 'No'],
      ['e7', 'button', 'Save search'],
      ['e8', 'textbox', 'Say "hi"'],
      ['e9', 'checkbox', 'Remote only'],
      ['e10', 'generic', null],
      [null, 'paragraph', null],
    ]);
    expect(nodes[2]?.attributes).toEqual({ level: '1', ref: 'e3' });
    expect(nodes[8]?.attributes['disabled']).toBe(true);
    expect(nodes[10]?.attributes).toEqual({ checked: true, active: true, ref: 'e9' });
    expect(nodes.map((node) => node.depth).slice(0, 3)).toEqual([0, 1, 0]);
    expect(decodeAriaSnapshot('')).toEqual([]);
  });

  it('[BRW-2] fits an oversized snapshot by declared rungs — nodes only, refs only, none — never a cut, and says which rung it used', () => {
    const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');
    const lines = (text: string): string[] => text.split('\n').slice(1);
    expect(fitSnapshot(SNAPSHOT, 10_000)).toEqual({ text: SNAPSHOT, rung: 'full' });

    // One byte too small for the whole: the nodes alone, property, text and inline-text lines gone.
    const nodes = fitSnapshot(SNAPSHOT, bytes(SNAPSHOT) - 1);
    expect(nodes.rung).toBe('nodes-only');
    expect(bytes(nodes.text)).toBeLessThan(bytes(SNAPSHOT));
    expect(nodes.text.split('\n')[0]).toBe(
      '[snapshot reduced to nodes-only: 2 of 15 lines not shown]',
    );
    expect(lines(nodes.text)).not.toContain('    - /url: /');
    expect(lines(nodes.text)).not.toContain('- text: Some prose the page shows');
    expect(lines(nodes.text)).toContain('  - paragraph');
    expect(lines(nodes.text)).toContain('  - option "Yes" [selected]');
    // Every kept node still decodes with the ref it had.
    expect(decodeAriaSnapshot(nodes.text).map((node) => node.ref)).toEqual(
      decodeAriaSnapshot(SNAPSHOT).map((node) => node.ref),
    );

    // Too small for the nodes: only those with refs, each a whole line of the original.
    const refs = fitSnapshot(SNAPSHOT, bytes(nodes.text) - 1);
    expect(refs.rung).toBe('refs-only');
    expect(lines(refs.text).every((line) => /\[ref=e\d+\]/.test(line))).toBe(true);
    expect(lines(refs.text).every((line) => SNAPSHOT.includes(line))).toBe(true);
    expect(lines(refs.text)).toHaveLength(10);

    // Too small even for that: nothing but the note.
    const none = fitSnapshot(SNAPSHOT, bytes(refs.text) - 1);
    expect(none).toEqual({
      text: '[snapshot reduced to none: 15 of 15 lines not shown]',
      rung: 'none',
    });
    for (const fitted of [nodes, refs, none]) {
      expect(bytes(fitted.text)).toBeLessThanOrEqual(bytes(SNAPSHOT) - 1);
    }
  });
});
