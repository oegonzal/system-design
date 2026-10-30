import {
  decodeAriaSnapshot,
  fitSnapshot,
  carriesRefNode,
  scopesOf,
  settledSnapshot,
  subtreeText,
  ancestryOf,
  landmarkRolesOf,
  withoutUnlistedRefs,
} from './aria-snapshot';

/** How many reads a ref-less page is given here; the session's own number is its observe policy's. */
const READS = 4;

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

  it('[BRW-2] reads the landmark a node sits in from the tree: the nearest declared role, itself included, and a region inside main stays main’s', () => {
    // Measured 2026-10-08: a results page's chrome — banner, navigation, the
    // search box — read settled while its main had rendered nothing yet; and
    // a chart's region sat inside main, so region is no landmark here.
    const page = [
      '- banner [ref=e1]:',
      '  - link "Home" [ref=e2]',
      '  - search [ref=e3]:',
      '    - searchbox "Search" [ref=e4]',
      '- navigation "Pages" [ref=e5]:',
      '  - link "Next" [ref=e6]',
      '- main [ref=e7]:',
      '  - button "Easy Apply" [ref=e8]',
      '  - region "Chart" [ref=e9]:',
      '    - button "More" [ref=e10]',
      '- button "Stray" [ref=e11]',
      '- contentinfo [ref=e12]:',
      '  - link "Help" [ref=e13]',
    ].join('\n');
    const nodes = decodeAriaSnapshot(page);
    const ancestry = ancestryOf(nodes);
    const landmarkOf = (ref: string) =>
      ancestry[nodes.findIndex((node) => node.ref === ref)]?.landmark;
    expect(landmarkOf('e1')).toBe('banner');
    expect(landmarkOf('e2')).toBe('banner');
    // The nearest landmark wins: a search box inside the banner is the search's.
    expect(landmarkOf('e4')).toBe('search');
    expect(landmarkOf('e6')).toBe('navigation');
    expect(landmarkOf('e8')).toBe('main');
    expect(landmarkOf('e10')).toBe('main');
    expect(landmarkOf('e11')).toBeNull();
    expect(landmarkOf('e13')).toBe('contentinfo');
    expect(landmarkRolesOf(nodes)).toEqual([
      'banner',
      'search',
      'navigation',
      'main',
      'contentinfo',
    ]);
    // Scope and landmark are read in the one walk, and a page without dialogs scopes nothing.
    expect(ancestry.every((entry) => entry.scope === null)).toBe(true);
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

    // Room for the dialog and the first of the words behind it, never their wordless lines.
    const scoped = fitSnapshot(page, 5_000, scope);
    expect(scoped.rung).toBe('scope');
    const lines = scoped.text.split('\n');
    expect(lines[0]).toMatch(
      /^\[snapshot reduced to scope: the open dialog "Apply to Acme" whole, the rest words-cut: \d+ of 187 lines not shown\]$/,
    );
    // The dialog first and whole, text line and value included; then the words behind it, in order.
    expect(lines.slice(1, 7)).toEqual(dialog);
    expect(scoped.text).toContain('Senior Engineer at a company');
    expect(scoped.text).not.toContain('  - link [ref=e100] [cursor=pointer]');
    expect(scoped.text).not.toContain('/url: /jobs/0');
    expect(bytes(scoped.text)).toBeLessThanOrEqual(5_000);

    // Less room: the page behind it goes, the dialog stays.
    const tight = fitSnapshot(page, 400, scope);
    expect(tight.rung).toBe('scope');
    expect(tight.text.split('\n').slice(1)).toEqual(dialog);
    expect(tight.text).toContain('the rest none: 181 of 187 lines not shown');

    // No room even for the dialog: the ordinary rungs over the whole page.
    expect(fitSnapshot(page, 120, scope).rung).toBe('none');
    // No open scope, or a scope the page does not carry: the ordinary rungs.
    expect(fitSnapshot(page, 5_000).rung).toBe('words-cut');
    expect(fitSnapshot(page, 5_000, { role: 'dialog', name: 'Cookies' }).rung).toBe('words-cut');
    // And a page that fits is whole whatever scope is open.
    expect(fitSnapshot(page, 100_000, scope)).toEqual({ text: page, rung: 'full' });
  });

  it('[BRW-2] fits an oversized snapshot by declared rungs — the lines with words, then those cut where the room ends, then none — and says which rung it used', () => {
    const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');
    const lines = (text: string): string[] => text.split('\n').slice(1);
    // Twenty pages of the fixture, refs kept unique, so each rung's saving dwarfs its note line.
    const page = Array.from({ length: 20 }, (_, copy) =>
      SNAPSHOT.replace(/\[ref=e(\d+)\]/g, (_match, n: string) => `[ref=e${Number(n) + copy * 10}]`),
    ).join('');
    expect(fitSnapshot(page, 100_000)).toEqual({ text: page, rung: 'full' });

    // One byte too small for the whole: the lines that carry words — named nodes, text lines,
    // inline text — stay whole; wordless container lines and property lines go, refs or not.
    const words = fitSnapshot(page, bytes(page) - 1);
    expect(words.rung).toBe('words-only');
    expect(words.text.split('\n')[0]).toBe(
      '[snapshot reduced to words-only: 60 of 300 lines not shown]',
    );
    expect(lines(words.text)).toContain('- text: Some prose the page shows');
    expect(lines(words.text)).toContain('  - paragraph: nothing interactive here');
    expect(lines(words.text)).toContain('  - option "No"');
    expect(lines(words.text)).not.toContain('- banner [ref=e1]:');
    expect(lines(words.text)).not.toContain('- generic [ref=e10]:');
    expect(lines(words.text)).not.toContain('    - /url: /');
    expect(lines(words.text).every((line) => page.includes(line))).toBe(true);

    // Too small for the words: the same lines in the same order, cut where the room ends.
    const cut = fitSnapshot(page, bytes(words.text) - 1);
    expect(cut.rung).toBe('words-cut');
    expect(cut.text.split('\n')[0]).toMatch(
      /^\[snapshot reduced to words-cut: \d+ of 300 lines not shown\]$/,
    );
    const kept = lines(cut.text);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept).toEqual(lines(words.text).slice(0, kept.length));

    // Too small for one line of words: nothing but the note — never a wordless page.
    const none = fitSnapshot(page, bytes('[snapshot reduced to none: 300 of 300 lines not shown]'));
    expect(none).toEqual({
      text: '[snapshot reduced to none: 300 of 300 lines not shown]',
      rung: 'none',
    });
    for (const fitted of [words, cut, none]) {
      expect(bytes(fitted.text)).toBeLessThanOrEqual(bytes(page) - 1);
    }
  });

  it('[BRW-2] keeps the lines that carry words, and cuts them where the room ends rather than reporting a wordless page or none', () => {
    // Measured 2026-10-08 on a results page: 1,012 node lines, 765 of them
    // unnamed containers carrying refs and no words, so nodes-only (56 KB) and
    // refs-only (55 KB) both overran the room a goal left and the model read
    // none, while the lines with words were 18.5 KB.
    const page = [
      ...Array.from({ length: 250 }, (_, i) =>
        [
          `- generic [ref=e${i * 4}]:`,
          `  - generic [ref=e${i * 4 + 1}]:`,
          `    - link "Result ${i} · Posted today" [ref=e${i * 4 + 2}]:`,
          `      - /url: /r/${i}`,
          `    - generic [ref=e${i * 4 + 3}]`,
        ].join('\n'),
      ),
      '- text: Application status',
    ].join('\n');
    const words = fitSnapshot(page, 16_000);
    expect(words.rung).toBe('words-only');
    expect(words.text.split('\n')[0]).toBe(
      '[snapshot reduced to words-only: 1000 of 1251 lines not shown]',
    );
    expect(words.text).toContain('    - link "Result 0 · Posted today" [ref=e2]:');
    expect(words.text).toContain('- text: Application status');
    expect(words.text).not.toContain('generic');
    // One byte short of the words: the first of them, in order — never the wordless containers.
    const cut = fitSnapshot(page, Buffer.byteLength(words.text, 'utf8') - 1);
    expect(cut.rung).toBe('words-cut');
    expect(cut.text).toContain('    - link "Result 0 · Posted today" [ref=e2]:');
    expect(cut.text).not.toContain('generic');
  });
});

describe('a snapshot shown in a goal', () => {
  it('[BRW-2] carries only the refs the observation lists: an unlisted one leaves its line, the words stay', () => {
    // Measured 2026-10-08: plans cited `f13e216` and `f13e220`, refs only the
    // snapshot carried, and the references validator cut them.
    const snapshot = [
      '- link "Apply on company website" [ref=e7] [cursor=pointer]:',
      '  - paragraph [ref=e9]: United States · Over 100 people clicked apply',
      '  - generic [ref=e10]',
    ].join('\n');
    expect(withoutUnlistedRefs(snapshot, new Set(['e7']))).toBe(
      [
        '- link "Apply on company website" [ref=e7] [cursor=pointer]:',
        '  - paragraph: United States · Over 100 people clicked apply',
        '  - generic',
      ].join('\n'),
    );
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
      READS,
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
        READS,
      ),
    ).toBe(nothing);
    expect(forever).toBe(READS);

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
