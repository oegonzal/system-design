import { renderIndexSection } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { GOAL_MAX_BYTES } from '../contracts';
import { goalSection } from './prompting';

const prose = ['# Mission', '', 'Open the first unmarked card.'].join('\n');

describe('the goal section every stage shows a model', () => {
  it('[QL-39] carries the goal without the index section its composer wrote for the validators', () => {
    const section = goalSection(`${prose}\n\n${renderIndexSection({ elements: [{ ref: 'e1' }] })}`);
    expect(section).toEqual({ text: `# Goal\n\n${prose}\n`, clipped: false });
  });

  it('[QL-39] shows a goal with no index section as written, and keeps a fenced block the prose goes on past', () => {
    expect(goalSection(prose).text).toBe(`# Goal\n\n${prose}\n`);
    const quoted = `${prose}\n\n${renderIndexSection({ a: 1 })}\n\nThen this.`;
    expect(goalSection(quoted).text).toBe(`# Goal\n\n${quoted}\n`);
  });

  it('[QL-39] clips a goal past the engine budget and says so', () => {
    const section = goalSection('x'.repeat(GOAL_MAX_BYTES + 1));
    expect(section.clipped).toBe(true);
    expect(section.text).toContain('[goal truncated]');
  });
});
