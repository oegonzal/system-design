import { describe, expect, it } from 'vitest';

import { firstSection, markdownSections, sectionCount } from './markdown-sections';

const PROMPT = [
  '# Serve an order history',
  '',
  'Shoppers expect one list.',
  '',
  '## Functional requirements',
  '',
  '1. Return orders newest first.',
  '',
  '## Non-functional requirements',
  '',
  '| Kind | Target |',
  '| --- | --- |',
  '',
  '## Constraints',
  '',
  '- None.',
].join('\n');

describe('markdownSections', () => {
  it('[UX-27] splits on H2 headings, keeping what comes before the first as its own unnamed section', () => {
    const sections = markdownSections(PROMPT);
    expect(sections.map((section) => section.heading)).toEqual([
      null,
      'Functional requirements',
      'Non-functional requirements',
      'Constraints',
    ]);
    expect(sections[0]?.body).toBe('# Serve an order history\n\nShoppers expect one list.');
    expect(sections[3]?.body).toBe('- None.');
    expect(sectionCount(PROMPT)).toBe(3);
    expect(sectionCount('# Only a title')).toBe(0);
  });

  it('[UX-27] the first section is the title, the preface and the first H2 section, and markdown with no second H2 is whole', () => {
    expect(firstSection(PROMPT)).toBe(
      [
        '# Serve an order history',
        '',
        'Shoppers expect one list.',
        '',
        '## Functional requirements',
        '',
        '1. Return orders newest first.',
      ].join('\n'),
    );
    const single = '# Title\n\n## Only section\n\nbody';
    expect(firstSection(single)).toBe(single);
  });
});
