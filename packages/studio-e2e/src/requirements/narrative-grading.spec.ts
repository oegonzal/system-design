import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The design narrative: prose authored beside the diagram, submitted with it,
 * and graded against it. `EVAL_DETERMINISTIC=1` (set by the webServer config)
 * pins grading to the rule engine, so the alignment finding is a pure
 * function of graph + narrative.
 */

/** The exact title the unmet `exp.nar.components-explained` expectation emits. */
const UNEXPLAINED_TITLE = 'Components the narrative never explains';

test.describe('the design narrative', () => {
  test('[UX-6] the narrative is submitted with the diagram and survives a reload', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    const story =
      'The Client calls the Service over HTTPS; the Service validates each order and ' +
      'writes it to the Database before confirming. This story must round-trip with the revision.';
    await canvas.fillNarrative(story);
    await canvas.submit();
    // Evaluated = the revision (and its narrative) is safely persisted server-side.
    await canvas.expectEvaluationComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.narrativeTab.click();
    await expect(canvas.narrativeEditor).toHaveValue(story);
  });

  test('[EVAL-9] a component the narrative never explains becomes a finding', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    // Mentions the Client and the Service — but never the Database (n-3).
    await canvas.fillNarrative(
      'The Client sends every order request to the Service over HTTPS. The Service ' +
        'validates the payload, applies the business rules, and writes the result to ' +
        'persistent storage before returning a confirmation to the Client.',
    );
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    const finding = canvas.findingItem(UNEXPLAINED_TITLE);
    await expect(finding).toBeVisible();
    // The message names the skipped component…
    await expect(finding).toContainText('Database');
    // …and the finding points at it on the canvas.
    await canvas.clickFinding(UNEXPLAINED_TITLE);
    await canvas.expectNodeHighlighted('n-3');
  });
});
