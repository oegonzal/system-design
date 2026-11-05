import { describe, expect, it } from 'vitest';

import { renderCanvasGoal } from './canvas-goal';
import { PLATFORM_IDS, PLATFORM_SECTION_HEADING, platformCatalogue } from './platforms';
import { PROMPT_MARKDOWN_BOUND } from './prompts';
import { GOAL_BUDGET_BYTES, textBytes } from './quality-loop/goal-index';

const MARKDOWN =
  '# Design a thing\n\n## Scenario\n\nYou run a shop.\n\n## Functional requirements\n\n1. Sell.\n';

describe('renderCanvasGoal', () => {
  it('[GEN-7] is the prompt itself for a platform-neutral prompt, as every grade read before platforms', () => {
    // Byte for byte, trailing newline included: a run is keyed by its goal.
    expect(renderCanvasGoal({ markdown: MARKDOWN, platform: null })).toBe(MARKDOWN);
  });

  it('[GEN-7] closes a platform prompt with the catalogue section, after the text and once', () => {
    const [platform] = PLATFORM_IDS;
    const goal = renderCanvasGoal({ markdown: MARKDOWN, platform });
    expect(goal.startsWith(MARKDOWN.trimEnd())).toBe(true);
    expect(goal.split(PLATFORM_SECTION_HEADING)).toHaveLength(2);
    expect(goal.indexOf(PLATFORM_SECTION_HEADING)).toBeGreaterThan(MARKDOWN.indexOf('Sell.'));
    for (const service of platformCatalogue(platform).services) {
      expect(goal).toContain(`\`${service.id}\``);
    }
  });

  it('[GEN-7] fits the engine budget with the longest prompt the studio stores and the whole catalogue behind it', () => {
    const [platform] = PLATFORM_IDS;
    const goal = renderCanvasGoal({
      markdown: 'x'.repeat(PROMPT_MARKDOWN_BOUND.ceiling),
      platform,
    });
    expect(textBytes(goal)).toBeLessThanOrEqual(GOAL_BUDGET_BYTES);
  });
});
