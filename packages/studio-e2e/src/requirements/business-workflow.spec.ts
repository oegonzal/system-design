import { expect, test } from '@playwright/test';

import { orderHistoryExperience } from '../support/backend';
import { buildNaiveDesign, openPracticeSessionWithPrompt } from '../support/canvas.page';

/**
 * The business-workflow layer, live: an order-history prompt states its
 * contracts, events, ingest SLAs and lifecycle; the author covers them BY
 * REFERENCE (a Fulfills pick, an emission, a carrying edge) and watches the
 * same corroboration verdict the grade will use flip while they work.
 *
 * The workflow spec is a pure function of (archetype, difficulty), so its
 * item ids — unlike NFR ids drawn per seed — are stable enough to name here;
 * `op-list-orders` exists at every difficulty.
 */
test.describe('the business workflow', () => {
  test('[PRD-1] a workflow prompt presents its contracts, events, ingest SLAs and lifecycle', async ({
    page,
    request,
  }) => {
    const experience = await orderHistoryExperience(request);
    const { prompt } = await openPracticeSessionWithPrompt(page, request, experience.id);

    const section = page.getByTestId('prompt-workflow');
    await expect(section).toBeVisible();
    await expect(section).toContainText('API contract');
    await expect(section).toContainText('Ingest SLAs');
    await expect(section).toContainText('Lifecycle');
    // Each ingest shows the budget its linked NFR states.
    const freshness = prompt.nonFunctionalRequirements.find(
      (nfr) => nfr.targetSpec?.metric === 'freshness_seconds',
    );
    await expect(section).toContainText(freshness?.target ?? 'visible');
  });

  test('[PRD-2] [PRD-4] coverage is claimed by reference and the chip flips as the canvas earns it', async ({
    page,
    request,
  }) => {
    const experience = await orderHistoryExperience(request);
    const { canvas } = await openPracticeSessionWithPrompt(page, request, experience.id);

    // Declare the serving query and link it — the select offers only spec ids.
    await canvas.addFromPalette('service');
    await canvas.selectNode('n-1');
    await canvas.addOperation('listOrders', 'query');
    await canvas.setOperationFulfills('op-list-orders');

    // Declared but not exercised: the verdict chip says so, live, pre-submit.
    await canvas.briefTab.click();
    await canvas.expectWorkflowVerdict('op-list-orders', 'uncorroborated');

    // Draw the call and carry the operation — the same judge re-runs.
    await canvas.addFromPalette('client');
    await canvas.connect('n-2', 'n-1');
    await canvas.selectEdge('e-1');
    await canvas.toggleCarry('listOrders');

    await canvas.briefTab.click();
    await canvas.expectWorkflowVerdict('op-list-orders', 'corroborated');
  });

  test('[PRD-3] silence scores product on a workflow prompt; other prompts never assess it', async ({
    page,
    request,
  }) => {
    const experience = await orderHistoryExperience(request);
    const { canvas } = await openPracticeSessionWithPrompt(page, request, experience.id);

    // The classic three-box sketch: no operations, no claims — silence.
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    await canvas.expectDimensionScored('product');
    // The unmet coverage names what the business layer is missing.
    await expect(page.getByTestId('evaluation-panel')).toContainText(
      /read contracts|write contracts|event/i,
    );
  });

  test('[PRD-3] a prompt without a workflow spec shows product as not assessed', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSessionWithPrompt(page, request);

    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    await expect(page.getByTestId('not-assessed-product')).toBeVisible();
  });
});
