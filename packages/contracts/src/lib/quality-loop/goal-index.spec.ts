import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  GOAL_INDEX_FENCE_OPEN,
  GOAL_INDEX_HEADING,
  readFencedIndex,
  renderIndexSection,
  stripIndexSection,
} from './goal-index';

const indexSchema = z.strictObject({ a: z.number() });
const prose = [
  '# Mission',
  '',
  'Open the first unmarked card.',
  '',
  '## Limits',
  '',
  '- One action per step.',
].join('\n');

describe('the index section every composer ends its goal with', () => {
  it('[QL-39] renders as the heading and one single-line fenced block, and reads back through the fence reader', () => {
    const section = renderIndexSection({ a: 1 });
    expect(section).toBe(`${GOAL_INDEX_HEADING}\n\n${GOAL_INDEX_FENCE_OPEN}{"a":1}\n\`\`\``);
    expect(readFencedIndex(`${prose}\n\n${section}`, indexSchema)).toEqual({ a: 1 });
  });

  it('[QL-39] is taken off whole for a model, leaving the prose as written', () => {
    const goal = `${prose}\n\n${renderIndexSection({ a: 1 })}`;
    expect(stripIndexSection(goal)).toBe(prose);
    expect(stripIndexSection(`${goal}\n`)).toBe(prose);
  });

  it('[QL-39] leaves a goal alone when it has no index section, when the block under the heading is not JSON, or when prose follows the block', () => {
    expect(stripIndexSection(prose)).toBe(prose);
    const broken = `${prose}\n\n${GOAL_INDEX_HEADING}\n\n${GOAL_INDEX_FENCE_OPEN}{ not json\n\`\`\``;
    expect(stripIndexSection(broken)).toBe(broken);
    const quoted = `${prose}\n\n${renderIndexSection({ a: 1 })}\n\nThen this.`;
    expect(stripIndexSection(quoted)).toBe(quoted);
  });
});
