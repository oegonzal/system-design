import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import { buildNaiveDesign, CanvasPage } from '../support/canvas.page';
import { step } from '../support/demo';
import { PromptsPage } from '../support/prompts.page';

const REPLICA_FINDING = 'Single database with no replica';

/**
 * The whole product in one story, and the only test the demo target runs.
 *
 * `step()` is what makes it watchable: the Trace Viewer groups every action
 * under the step that caused it, and in demo mode each step is followed by a
 * beat, so the run reads as a narrative rather than a list of clicks:
 *
 *     nx run studio-e2e:e2e-demo
 */
test(
  '[EVAL-3] the practice loop: prompt → design → verdict → accepted fix → better score',
  { tag: '@demo' },
  async ({ page }) => {
    const nav = new AppNav(page);
    const prompts = new PromptsPage(page);
    const canvas = new CanvasPage(page);

    await step(page, ' 1 — Generate a prompt from the ticketing experience', async () => {
      await nav.open('/prompts');
      await prompts.selectTicketingExperience();
      await prompts.generate();
      await expect(prompts.promptPane).toBeVisible();
    });

    await step(page, ' 2 — Start a practice session', async () => {
      await prompts.startPractice();
      await canvas.ready();
    });

    await step(
      page,
      ' 3 — Sketch the classic first idea: client → service → database',
      async () => {
        await buildNaiveDesign(canvas);
      },
    );

    await step(page, ' 4 — Submit revision #1 for evaluation', async () => {
      await canvas.submit();
      await canvas.expectEvaluationComplete(1);
    });

    await step(page, ' 5 — The critical finding highlights the fragile database', async () => {
      await canvas.clickFinding(REPLICA_FINDING);
      await canvas.expectNodeHighlighted('n-3');
    });

    await step(page, ' 6 — Preview the suggested read replica, then accept it', async () => {
      await canvas.previewFix(REPLICA_FINDING);
      await expect(canvas.suggestionControls).toBeVisible();
      await canvas.acceptSuggestion();
      await expect(canvas.suggestionControls).toHaveCount(0);
      await canvas.expectNodeCount(4); // the ghost replica is real now
    });

    await step(page, ' 7 — Resubmit as revision #2', async () => {
      await canvas.submit();
      await canvas.expectEvaluationComplete(2);
    });

    await step(page, ' 8 — The revision timeline shows a strictly rising score', async () => {
      await canvas.expectScoreTrendIncreasing();
    });
  },
);
