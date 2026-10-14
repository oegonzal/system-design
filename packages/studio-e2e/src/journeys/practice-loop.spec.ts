import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import { AUTHORED_MARKDOWN, AUTHORED_TITLE } from '../support/backend';
import {
  buildNaiveDesign,
  CanvasPage,
  NAIVE_DESIGN_PLUS_ONE_SCORE,
  NAIVE_DESIGN_SCORE,
} from '../support/canvas.page';
import { step } from '../support/demo';
import { PromptsPage } from '../support/prompts.page';

const DATABASE_FINDING = 'unhandled_failure|node.3';

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
  '[EVAL-3] the practice loop: prompt → design → verdict → improved along a finding → better score',
  { tag: '@demo' },
  async ({ page }) => {
    const nav = new AppNav(page);
    const prompts = new PromptsPage(page);
    const canvas = new CanvasPage(page);

    await step(page, ' 1 — Write the order-history prompt', async () => {
      await nav.open('/prompts');
      await prompts.openComposer();
      await prompts.author({ title: AUTHORED_TITLE, markdown: AUTHORED_MARKDOWN });
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

    await step(page, ' 4 — Submit revision #1 for grading', async () => {
      await canvas.submit();
      await canvas.feedback.expectComplete(1);
      await canvas.feedback.expectOverall(NAIVE_DESIGN_SCORE);
      await canvas.feedback.expectDecision('revise');
    });

    await step(page, ' 5 — The high finding highlights the fragile database', async () => {
      await canvas.feedback.clickFinding(DATABASE_FINDING);
      await canvas.expectNodeHighlighted('n-3', 'high');
    });

    await step(page, ' 6 — Improve along the finding: add a read replica', async () => {
      // Dropped at an exact spot, clear of the column the first three occupy:
      // a drop beside the service would cover its connection handle, so the
      // replica goes left of and between the rows.
      await canvas.dragFromPalette('replica', 40, 140); // n-4
      await expect(canvas.node('n-4')).toHaveAttribute('data-kind', 'replica');
      await canvas.connect('n-2', 'n-4'); // e-3: the service reads from the replica
      await expect(canvas.edge('e-3')).toBeAttached();
      await canvas.expectNodeCount(4);
    });

    await step(page, ' 7 — Resubmit as revision #2', async () => {
      await canvas.submit();
      await canvas.feedback.expectComplete(2);
      await canvas.feedback.expectOverall(NAIVE_DESIGN_PLUS_ONE_SCORE);
    });

    await step(page, ' 8 — The revision timeline shows a strictly rising score', async () => {
      await canvas.revisions.expectScoreTrendIncreasing();
    });
  },
);
