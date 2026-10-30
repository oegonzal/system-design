import { decodeAriaSnapshot, landmarkWords } from './aria-snapshot';

/** What a tree says inside one landmark: the words a unit of work carries as the page's statement of it. */
describe('the words inside a landmark', () => {
  it('[BRW-16] reads what the tree says inside one landmark, node by node in document order — a name, an inline text, both, never what a control holds — leaves a landmark nested in it to its own role, and reads nothing from a landmark the tree lacks', () => {
    // Measured 2026-10-14: on the shipped layout a navigation sits inside main
    // on 11 of 15 recorded unit-opening pages, and a complementary overlay on
    // one more — neither is the main's statement of anything.
    const page = [
      '- banner [ref=e1]:',
      '  - link "Home" [ref=e2]',
      '- main [ref=e3]:',
      '  - navigation "Jump" [ref=e13]:',
      '    - link "Top" [ref=e14]',
      '  - heading "Senior Engineer" [level=1] [ref=e4]',
      '  - generic [ref=e5]:',
      '    - paragraph: Acme builds tools for teams.',
      '    - text: Remote',
      '  - generic "Pay" [ref=e6]: $200k',
      '  - textbox "Notes" [ref=e7]: typed so far',
      '  - button "Easy Apply" [ref=e8]',
      '  - region "Similar" [ref=e9]:',
      '    - link "Staff Engineer" [ref=e10]',
      '  - complementary "Messages" [ref=e15]:',
      '    - text: 3 unread',
      '- contentinfo [ref=e11]:',
      '  - link "Help" [ref=e12]',
    ].join('\n');
    const nodes = decodeAriaSnapshot(page);
    expect(landmarkWords(nodes, 'main')).toEqual([
      'Senior Engineer',
      'Acme builds tools for teams.',
      'Remote',
      'Pay $200k',
      'Notes',
      'Easy Apply',
      'Similar',
      'Staff Engineer',
    ]);
    // A region is not a landmark of the vocabulary: its words stay the main's. A nested landmark's are its own.
    expect(landmarkWords(nodes, 'navigation')).toEqual(['Jump', 'Top']);
    expect(landmarkWords(nodes, 'complementary')).toEqual(['Messages', '3 unread']);
    expect(landmarkWords(nodes, 'banner')).toEqual(['Home']);
    expect(landmarkWords(nodes, 'search')).toEqual([]);
    expect(landmarkWords([], 'main')).toEqual([]);
  });
});
