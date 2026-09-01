import { expect, test } from '@playwright/test';
import { EVAL_DIMENSIONS } from '@sysdesign/contracts';

import { generatePrompt } from '../support/backend';
import { buildNaiveDesign, CanvasPage, openPracticeSession } from '../support/canvas.page';
import { PromptsPage } from '../support/prompts.page';

/**
 * Submit → graded verdict, against the real worker. `EVAL_DETERMINISTIC=1`
 * (set by the webServer config) pins grading to the rule engine, so the
 * naive design's findings are a function of the graph alone.
 */
test.describe('the critic pipeline', () => {
  test('[EVAL-1] a submitted revision is graded with per-dimension scores', async ({
    page,
    request,
  }) => {
    // Start practice the way a person does: from a generated prompt's detail page.
    const prompt = await generatePrompt(request);
    const prompts = new PromptsPage(page);
    await prompts.openDetail(prompt.id);
    await prompts.startPractice();

    const canvas = new CanvasPage(page);
    await canvas.ready();
    await buildNaiveDesign(canvas);
    await canvas.submit();

    await canvas.expectEvaluationComplete(1);
    // 0–100, possibly fractional (weighted dimension means, e.g. "74.3").
    await expect(page.getByTestId('overall-score')).toHaveText(/^\d{1,3}(\.\d+)?$/);
    for (const dimension of EVAL_DIMENSIONS) {
      await expect(page.getByRole('meter', { name: dimension })).toBeVisible();
    }
    // No narrative was submitted — that is graded, not excused, so the
    // dimension shows a real meter at zero rather than dropping out.
    await expect(page.getByTestId('not-assessed-communication')).toHaveCount(0);
    await expect(page.getByRole('meter', { name: 'communication' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  test('[EVAL-2] findings carry a message and point at affected elements', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    await canvas.expectFindingCount((count) => count >= 1);

    // Every generated prompt carries an availability NFR, so the unreplicated
    // database always draws this exact critical finding.
    const finding = canvas.findingItem('Single database with no replica');
    await expect(finding).toBeVisible();
    // The message teaches — it ties the risk back to the prompt's target.
    await expect(finding).toContainText('availability');

    await canvas.clickFinding('Single database with no replica');
    await canvas.expectNodeHighlighted('n-3'); // the database it points at
  });
});
