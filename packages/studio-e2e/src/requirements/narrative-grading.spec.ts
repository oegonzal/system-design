import { expect, test } from '@playwright/test';

import { createPracticeSession } from '../support/backend';
import { buildNaiveDesign, CanvasPage, openPracticeSession } from '../support/canvas.page';

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

  test('[EVAL-10] a submitted narrative earns communication, and a skipped requirement is cited by id', async ({
    page,
    request,
  }) => {
    const { prompt, session } = await createPracticeSession(request);
    const availability = prompt.nonFunctionalRequirements.find(
      (nfr) => nfr.kind === 'availability',
    );
    if (!availability) throw new Error('every generated prompt carries an availability NFR');

    await page.goto(`/practice/${session.id}`);
    const canvas = new CanvasPage(page);
    await canvas.ready();
    await buildNaiveDesign(canvas);

    // Covers every component and flow, engages latency/consistency/throughput —
    // but never says a word about staying up.
    await canvas.fillNarrative(
      'The Client calls the Service, which validates each order and writes it to the Database. ' +
        'Reads stay inside the p99 budget during the spike, checkout is idempotent so no seat ' +
        'is ever oversold, and the opening burst is absorbed by autoscaled copies of the Service.',
    );
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    // Communication is now assessed — a real meter, not the "Not assessed" row.
    await expect(page.getByRole('meter', { name: 'communication' })).toBeVisible();
    await expect(page.getByTestId('not-assessed-communication')).toHaveCount(0);

    // The silent requirement becomes a teaching finding citing the NFR's own id.
    const silent = canvas.findingItem('A story silent on the availability requirement');
    await expect(silent).toBeVisible();
    await expect(silent.getByTestId('finding-nfr')).toHaveText(availability.id);
  });
});
