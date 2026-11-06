import { describe, expect, it } from 'vitest';

import { EDGE_CONFIG_HINTS, NODE_KIND_CATEGORIES, NODE_KINDS } from './canvas';
import { CANVAS_VOCABULARY_HEADING, renderCanvasVocabularySection } from './canvas-vocabulary';
import { NODE_KIND_GUIDE } from './node-guide';

describe('the canvas vocabulary section', () => {
  it('[GEN-9] names every role once, shelf by shelf, in the guide’s words, and the keys a hop is offered', () => {
    const section = renderCanvasVocabularySection();
    expect(section.startsWith(`${CANVAS_VOCABULARY_HEADING}\n`)).toBe(true);
    for (const category of NODE_KIND_CATEGORIES) expect(section).toContain(`### ${category.label}`);
    for (const kind of NODE_KINDS) {
      const lines = section.split('\n').filter((line) => line.startsWith(`- \`${kind}\` — `));
      expect(lines, kind).toHaveLength(1);
      expect(lines[0]).toContain(NODE_KIND_GUIDE[kind].what);
    }
    expect(section).toContain(EDGE_CONFIG_HINTS.join(', '));
  });
});
