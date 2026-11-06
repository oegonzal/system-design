import { describe, expect, it } from 'vitest';

import { renderCanvasGoal } from './canvas-goal';
import { CANVAS_VOCABULARY_HEADING, renderCanvasVocabularySection } from './canvas-vocabulary';
import {
  LIFECYCLE_SECTION_HEADING,
  LIFECYCLE_STAGES,
  renderLifecycleSection,
  servicesForStage,
} from './lifecycle';
import { PLATFORM_IDS, PLATFORM_SECTION_HEADING, platformCatalogue } from './platforms';
import { PROMPT_MARKDOWN_BOUND } from './prompts';
import { GOAL_BUDGET_BYTES, textBytes } from './quality-loop/goal-index';

const MARKDOWN =
  '# Design a thing\n\n## Scenario\n\nYou run a shop.\n\n## Functional requirements\n\n1. Sell.\n';

describe('renderCanvasGoal', () => {
  it('[GEN-8] [GEN-9] is the prompt closed by the canvas vocabulary and the request lifecycle for a platform-neutral prompt, and no catalogue', () => {
    // Exactly this composition: a run is keyed by its goal, and the e2e scripts one by the same function.
    const goal = renderCanvasGoal({ markdown: MARKDOWN, platform: null });
    expect(goal).toBe(
      `${MARKDOWN.trimEnd()}\n\n${renderCanvasVocabularySection()}\n\n${renderLifecycleSection(null)}`,
    );
    expect(goal).not.toContain(PLATFORM_SECTION_HEADING);
  });

  it('[GEN-7] closes a platform prompt with the catalogue section, after the text and once', () => {
    const [platform] = PLATFORM_IDS;
    const goal = renderCanvasGoal({ markdown: MARKDOWN, platform });
    expect(goal.startsWith(MARKDOWN.trimEnd())).toBe(true);
    expect(goal.split(PLATFORM_SECTION_HEADING)).toHaveLength(2);
    expect(goal.indexOf(PLATFORM_SECTION_HEADING)).toBeGreaterThan(MARKDOWN.indexOf('Sell.'));
    // [GEN-9] The vocabulary stands between the prompt and the catalogue, once.
    expect(goal.split(CANVAS_VOCABULARY_HEADING)).toHaveLength(2);
    expect(goal.indexOf(CANVAS_VOCABULARY_HEADING)).toBeLessThan(
      goal.indexOf(PLATFORM_SECTION_HEADING),
    );
    for (const service of platformCatalogue(platform).services) {
      expect(goal).toContain(`\`${service.id}\``);
    }
  });

  it('[GEN-8] closes every prompt with the lifecycle section after the catalogue, once, naming the services that serve each stage', () => {
    const [platform] = PLATFORM_IDS;
    const catalogue = platformCatalogue(platform);
    const goal = renderCanvasGoal({ markdown: MARKDOWN, platform });
    expect(goal.split(LIFECYCLE_SECTION_HEADING)).toHaveLength(2);
    expect(goal.indexOf(LIFECYCLE_SECTION_HEADING)).toBeGreaterThan(
      goal.indexOf(PLATFORM_SECTION_HEADING),
    );
    const lifecycle = goal.slice(goal.indexOf(LIFECYCLE_SECTION_HEADING));
    for (const stage of LIFECYCLE_STAGES) {
      const line = lifecycle.split('\n').find((item) => item.startsWith(`- ${stage.label} — `));
      expect(line, stage.id).toBeDefined();
      for (const service of servicesForStage(catalogue, stage)) {
        expect(line).toContain(`\`${service.id}\``);
      }
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
