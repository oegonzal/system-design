import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The design brief is the grounded half of explaining a design: for each of
 * the prompt's criteria, which components hold it, a claim in the author's
 * words, and — where a request travels — the path of edges it takes. Every
 * reference is one the grader can check against the canvas, which is why it
 * is authored by reference (a checkbox per component, a button per hop)
 * rather than typed.
 */
test.describe('the design brief', () => {
  test('[UX-6] a criterion is bound to components with a claim and a traced path, submitted with the diagram, and comes back on reload', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request); // rubric c1…c5
    await buildNaiveDesign(canvas); // client n-1 → service n-2 → database n-3

    const claim = 'the service reads the customer shard newest first';
    await canvas.expectBindingState('c1', 'empty');
    await canvas.setBindingClaim('c1', claim);
    await canvas.expectBindingState('c1', 'incomplete');
    await canvas.toggleBindingNode('c1', 'n-2');
    await canvas.toggleBindingNode('c1', 'n-3');
    await canvas.expectBindingState('c1', 'bound');

    // The tracer offers only hops that continue the walk: after e-1 lands on
    // the service, e-2 is the one edge leaving it.
    await canvas.openFlowTracer('c1');
    await canvas.traceFlow('c1', ['e-1', 'e-2']);
    await canvas.expectFlowTraced('c1', 2);

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.briefTab.click();

    // The claim, the components and the traced walk all survive the round trip.
    await expect(canvas.bindingClaim('c1')).toHaveValue(claim);
    await expect(canvas.bindingNode('c1', 'n-2')).toBeChecked();
    await expect(canvas.bindingNode('c1', 'n-3')).toBeChecked();
    await expect(canvas.bindingNode('c1', 'n-1')).not.toBeChecked();
    await canvas.expectBindingState('c1', 'bound');
    await canvas.expectFlowTraced('c1', 2);
  });
});
