import { carriesRefNode, decodeAriaSnapshot, fitSnapshot } from './aria-snapshot';

/** How one line is read: the refs Playwright mints, and the lines YAML wraps. */
describe('the lines Playwright writes', () => {
  it('[BRW-2] reads a line YAML wrapped in single quotes as the same node: its role, its name with the doubled quotes undone, its ref and inline text', () => {
    // Measured 2026-10-13: Playwright quotes a line whose name holds `: `, and
    // a sponsorship question so worded read as no node at all — the field was
    // never answered, and the page refusing to advance over it stalled the session.
    const wrapped = [
      '- generic [ref=e1]:',
      `  - 'combobox "Will you require sponsorship?*Please note: proof may be required.*" [active] [ref=e2] [cursor=pointer]':`,
      '    - option "Select an option" [disabled] [selected]',
      '    - option "No"',
      `  - 'radio "Have you completed the following level of education: Bachelor''s Degree?" [checked] [ref=e3]'`,
      `  - 'textbox "Note: optional" [ref=e4]': a value`,
    ].join('\n');
    const nodes = decodeAriaSnapshot(wrapped);
    expect(nodes.map((node) => [node.ref, node.role, node.name, node.depth])).toEqual([
      ['e1', 'generic', null, 0],
      ['e2', 'combobox', 'Will you require sponsorship?*Please note: proof may be required.*', 1],
      [null, 'option', 'Select an option', 2],
      [null, 'option', 'No', 2],
      ['e3', 'radio', "Have you completed the following level of education: Bachelor's Degree?", 1],
      ['e4', 'textbox', 'Note: optional', 1],
    ]);
    expect(nodes[1]?.attributes).toEqual({ active: true, ref: 'e2', cursor: 'pointer' });
    expect(nodes[5]?.inline).toBe('a value');
    // A reduced snapshot keeps a wrapped line as it keeps any line with words.
    const big = [
      wrapped,
      ...Array.from({ length: 200 }, () => `- generic "${'x'.repeat(80)}"`),
    ].join('\n');
    expect(fitSnapshot(big, 4_000).text).toContain('[ref=e2]');
  });
});

describe('the refs Playwright mints', () => {
  it('[BRW-2] carries a frame-scoped ref as readily as a same-document one, in the decoder and in a reduced snapshot', () => {
    // Measured live: a search-results page renders in a frame, so every ref
    // came back `f1e7` rather than `e7`. Against a grammar of `e\d+` the page
    // read as having no interactive element at all, and a reduction filtering
    // by the same shape in a second place kept none of its lines.
    const framed = [
      '- generic [ref=f1e1]:',
      '  - link "site home" [ref=f1e7] [cursor=pointer]:',
      '    - /url: /?t=h_',
      '  - combobox "Search" [ref=f1e17]: playwright aria snapshot',
    ].join('\n');
    expect(decodeAriaSnapshot(framed).map((node) => node.ref)).toEqual(['f1e1', 'f1e7', 'f1e17']);
    expect(carriesRefNode(framed)).toBe(true);

    // A reduced snapshot keeps those lines, as it does a same-document page's.
    // The page is built so reducing it reduces: more words than the room.
    const big = [
      '- generic [ref=f1e1]:',
      ...Array.from({ length: 40 }, (_, i) => `  - link "r${i}" [ref=f1e${i + 2}]`),
      // Named nodes past the links: more words than the room, so the cut is what fits.
      ...Array.from({ length: 200 }, () => `  - generic "${'x'.repeat(80)}"`),
    ].join('\n');
    const fitted = fitSnapshot(big, 4_000);
    expect(fitted.rung).toBe('words-cut');
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
