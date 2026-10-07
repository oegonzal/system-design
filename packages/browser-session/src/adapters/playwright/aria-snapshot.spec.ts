import {
  EMPTY_SNAPSHOT_READS,
  decodeAriaSnapshot,
  fitSnapshot,
  carriesRefNode,
  scopesOf,
  settledSnapshot,
  subtreeText,
} from './aria-snapshot';

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
  it('[BRW-2] reads every node with the ref Playwright minted, its role, name, attributes and inline text; a text line is a node of the one pseudo-role, a property line is no node', () => {
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
      [null, 'text', null],
      ['e9', 'checkbox', 'Remote only'],
      ['e10', 'generic', null],
      [null, 'paragraph', null],
    ]);
    expect(nodes[2]?.attributes).toEqual({ level: '1', ref: 'e3' });
    expect(nodes[8]?.attributes['disabled']).toBe(true);
    expect(nodes[10]?.inline).toBe('Some prose the page shows');
    expect(nodes[11]?.attributes).toEqual({ checked: true, active: true, ref: 'e9' });
    expect(nodes[13]?.inline).toBe('nothing interactive here');
    expect(nodes.filter((node) => node.inline !== null)).toHaveLength(2);
    expect(nodes.map((node) => node.depth).slice(0, 3)).toEqual([0, 1, 0]);
    expect(decodeAriaSnapshot('')).toEqual([]);
  });

  it('[BRW-2] reads the dialog a node sits in from the tree, and the words beneath an unnamed node', () => {
    // The live shape, both halves: a results page whose links carry their words
    // in child paragraphs (26 of 37 elements read `link ""` or `button ""` on
    // 2026-10-07), and an application dialog rendered as `- dialog "…"` with
    // its fields beneath it.
    const page = [
      '- generic [ref=e1]:',
      '  - banner [ref=e2]:',
      '    - button [ref=e3] [cursor=pointer]:',
      '      - img "Acme logo" [ref=e4]',
      '    - link [ref=e5] [cursor=pointer]:',
      '      - /url: /jobs/123',
      '      - generic [ref=e6]:',
      '        - paragraph [ref=e7]: Senior Engineer',
      '        - paragraph [ref=e8]: Acme',
      '  - main [ref=e9]:',
      '    - button "Easy Apply" [ref=e10]',
      '  - dialog "Apply to Acme" [ref=e11]:',
      '    - heading "Contact info" [level=2] [ref=e12]',
      '    - generic [ref=e13]:',
      '      - text: First name*',
      '      - textbox "First name*" [ref=e14] [active]: Oscar',
      '    - button "Next" [ref=e15]',
      '  - button "Dismiss" [ref=e16]',
    ].join('\n');
    const nodes = decodeAriaSnapshot(page);
    const scopes = scopesOf(nodes);
    const scopeOf = (ref: string) => scopes[nodes.findIndex((node) => node.ref === ref)];
    expect(scopeOf('e10')).toBeNull();
    expect(scopeOf('e11')).toEqual({ role: 'dialog', name: 'Apply to Acme' });
    expect(scopeOf('e14')).toEqual({ role: 'dialog', name: 'Apply to Acme' });
    expect(scopeOf('e15')).toEqual({ role: 'dialog', name: 'Apply to Acme' });
    // A sibling after the dialog, at the dialog's own depth, is outside it.
    expect(scopeOf('e16')).toBeNull();

    const wordsOf = (ref: string) =>
      subtreeText(
        nodes,
        nodes.findIndex((node) => node.ref === ref),
      );
    expect(wordsOf('e5')).toBe('Senior Engineer Acme');
    expect(wordsOf('e3')).toBe('Acme logo');
    // A textbox's inline text is what it holds, not a word anyone calls it by: it stays out of the words.
    expect(wordsOf('e13')).toBe('First name* First name*');
    expect(wordsOf('e14')).toBe('');
    expect(wordsOf('e10')).toBe('');
    expect(subtreeText(nodes, 99)).toBe('');
  });

  it('[BRW-2] keeps the open scope whole when the page around it must be reduced, and says so in its first line', () => {
    // Measured 2026-10-07: at the recorded density a 1 400-line page lands on
    // `none` inside the room a goal leaves, however large the observation's own
    // bound — so the dialog's twenty lines, which are what the plan acts on,
    // are what a reduction gives up last.
    const dialog = [
      '  - dialog "Apply to Acme" [ref=e11]:',
      '    - heading "Contact info" [level=2] [ref=e12]',
      '    - generic [ref=e13]:',
      '      - text: First name*',
      '      - textbox "First name*" [ref=e14]: Oscar',
      '    - button "Next" [ref=e15]',
    ];
    const behind = Array.from({ length: 60 }, (_, i) =>
      [
        `  - link [ref=e${100 + i}] [cursor=pointer]:`,
        `    - /url: /jobs/${i}`,
        `    - paragraph [ref=e${200 + i}]: ${'Senior Engineer at a company with a long name'.repeat(2)} ${i}`,
      ].join('\n'),
    );
    const page = [
      '- generic [ref=e1]:',
      ...behind.slice(0, 30),
      ...dialog,
      ...behind.slice(30),
    ].join('\n');
    const scope = { role: 'dialog' as const, name: 'Apply to Acme' };
    const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

    // Room for the dialog and the nodes of the page behind it, not for their words.
    const scoped = fitSnapshot(page, 5_000, scope);
    expect(scoped.rung).toBe('scope');
    const lines = scoped.text.split('\n');
    expect(lines[0]).toBe(
      '[snapshot reduced to scope: the open dialog "Apply to Acme" whole, the rest nodes-only: 60 of 187 lines not shown]',
    );
    // The dialog first and whole, text line and value included; the page behind it as nodes.
    expect(lines.slice(1, 7)).toEqual(dialog);
    expect(scoped.text).toContain('  - link [ref=e100] [cursor=pointer]');
    expect(scoped.text).not.toContain('/url: /jobs/0');
    expect(scoped.text).not.toContain('Senior Engineer at a company');
    expect(bytes(scoped.text)).toBeLessThanOrEqual(5_000);

    // Less room: the page behind it goes, the dialog stays.
    const tight = fitSnapshot(page, 400, scope);
    expect(tight.rung).toBe('scope');
    expect(tight.text.split('\n').slice(1)).toEqual(dialog);
    expect(tight.text).toContain('the rest none: 181 of 187 lines not shown');

    // No room even for the dialog: the ordinary rungs over the whole page.
    expect(fitSnapshot(page, 120, scope).rung).toBe('none');
    // No open scope, or a scope the page does not carry: the ordinary rungs.
    expect(fitSnapshot(page, 5_000).rung).toBe('nodes-only');
    expect(fitSnapshot(page, 5_000, { role: 'dialog', name: 'Cookies' }).rung).toBe('nodes-only');
    // And a page that fits is whole whatever scope is open.
    expect(fitSnapshot(page, 100_000, scope)).toEqual({ text: page, rung: 'full' });
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
    // Every kept element node still decodes with the ref it had; the text lines are what the rung dropped.
    const elementRefs = (text: string) =>
      decodeAriaSnapshot(text)
        .filter((node) => node.role !== 'text')
        .map((node) => node.ref);
    expect(elementRefs(nodes.text)).toEqual(elementRefs(SNAPSHOT));

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

describe('reading a page that has not settled', () => {
  it('[BRW-2] takes a ref-less read again rather than reporting a page with nothing on it, and stops at the declared bound', async () => {
    const nothing = '- generic:\n  - generic';
    const settled = '- generic [ref=e1]:\n  - link "Next" [ref=e2]';
    expect(carriesRefNode(nothing)).toBe(false);
    expect(carriesRefNode(settled)).toBe(true);

    // The live shape: the document is mid-navigation for the first two reads —
    // once unreadable altogether, once readable but ref-less — and settles on
    // the third. The page is reported as it is, not as it was for an instant.
    const reads: (string | null)[] = [null, nothing, settled];
    let taken = 0;
    let paused = 0;
    const text = await settledSnapshot(
      () => {
        const index = taken;
        taken += 1;
        // Indexed without `??` on the read itself: a deliberate null read is an
        // unreadable document, not a missing fixture entry.
        return Promise.resolve(index < reads.length ? (reads[index] ?? null) : settled);
      },
      () => {
        paused += 1;
        return Promise.resolve();
      },
    );
    expect(text).toBe(settled);
    expect(taken).toBe(3);
    // One pause between reads, never after the read that settled.
    expect(paused).toBe(2);

    // A page that really has nothing interactive on it is reported, not retried
    // forever: the last answer that came back is the answer.
    let forever = 0;
    expect(
      await settledSnapshot(
        () => {
          forever += 1;
          return Promise.resolve(nothing);
        },
        () => Promise.resolve(),
      ),
    ).toBe(nothing);
    expect(forever).toBe(EMPTY_SNAPSHOT_READS);

    // A document that never becomes readable yields the empty page, not a throw.
    expect(
      await settledSnapshot(
        () => Promise.resolve(null),
        () => Promise.resolve(),
        2,
      ),
    ).toBe('');
  });
});
describe('the refs Playwright mints', () => {
  it('[BRW-2] carries a frame-scoped ref as readily as a same-document one, in the decoder and in the rung that keeps ref lines', () => {
    // Measured live: a search-results page renders in a frame, so every ref
    // came back `f1e7` rather than `e7`. Against a grammar of `e\d+` the page
    // read as having no interactive element at all, and the refs-only rung —
    // filtering by the same shape in a second place — kept none of its lines.
    const framed = [
      '- generic [ref=f1e1]:',
      '  - link "site home" [ref=f1e7] [cursor=pointer]:',
      '    - /url: /?t=h_',
      '  - combobox "Search" [ref=f1e17]: playwright aria snapshot',
    ].join('\n');
    expect(decodeAriaSnapshot(framed).map((node) => node.ref)).toEqual(['f1e1', 'f1e7', 'f1e17']);
    expect(carriesRefNode(framed)).toBe(true);

    // The rung keeps those lines, as it does a same-document page's. The page
    // is built so reducing it reduces: property lines outnumber node lines,
    // which is the shape of a real results page.
    const big = [
      '- generic [ref=f1e1]:',
      ...Array.from({ length: 40 }, (_, i) => `  - link "r${i}" [ref=f1e${i + 2}]`),
      // Ref-less nodes the rung above keeps whole: what makes refs-only the
      // first rung that fits, so the test reaches the rung it is about.
      ...Array.from({ length: 200 }, () => `  - generic "${'x'.repeat(80)}"`),
    ].join('\n');
    const fitted = fitSnapshot(big, 4_000);
    expect(fitted.rung).toBe('refs-only');
    expect(fitted.text).toContain('[ref=f1e2]');
    expect(fitted.text).not.toContain('/url:');

    // A token that is not safe to put in a selector never becomes a ref —
    // whether the line is read and its ref refused, or the line is no node at
    // all. Either way nothing reaches `aria-ref=` that could change what it
    // selects.
    for (const bad of ['e1 e2', 'e1]', '../e1', 'E1', '', 'e'.repeat(40)]) {
      const node = decodeAriaSnapshot(`- link "x" [ref=${bad}]`)[0];
      expect(node?.ref ?? null).toBeNull();
    }
    // And a safe one does, however it is spelled.
    for (const good of ['e1', 'f1e7', 'f12f3e45']) {
      expect(decodeAriaSnapshot(`- link "x" [ref=${good}]`)[0]?.ref).toBe(good);
    }
  });
});
