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
    await canvas.brief.expectState('c1', 'empty');
    await canvas.brief.setClaim('c1', claim);
    await canvas.brief.expectState('c1', 'incomplete');
    await canvas.brief.toggleNode('c1', 'n-2');
    await canvas.brief.toggleNode('c1', 'n-3');
    await canvas.brief.expectState('c1', 'bound');

    // The tracer offers only hops that continue the walk: after e-1 lands on
    // the service, e-2 is the one edge leaving it.
    await canvas.brief.openTracer('c1');
    await canvas.brief.trace('c1', ['e-1', 'e-2']);
    await canvas.brief.expectTraced('c1', 2);
    // [UX-32] Under the walk, what the lifecycle declares for it: the way in and where it rests.
    await expect(page.getByTestId('flow-stages-c1')).toContainText('Enters as a client');
    await expect(page.getByTestId('flow-stage-c1-ingress')).toContainText('missing');
    await expect(page.getByTestId('flow-rest-c1')).toContainText('Comes to rest at');

    // [UX-34] The traced path is shown on the canvas as it is traced: its hops
    // numbered, a stray block dimmed; the toggle hides it; a sync call reads both ways.
    await canvas.brief.expectFocused('c1', true);
    await canvas.expectEdgeSequence('e-1', '1');
    await canvas.expectEdgeSequence('e-2', '2');
    await canvas.addFromPalette('cache'); // n-4, off the path
    await canvas.expectOnPath('n-4', false);
    await canvas.expectOnPath('n-2', true);
    await canvas.brief.toggleFocus('c1');
    await canvas.brief.expectFocused('c1', false);
    await canvas.expectOnPath('n-4', null);
    await canvas.expectRequestReply('e-1');

    await canvas.submit();
    await canvas.feedback.expectComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.brief.tab.click();

    // The claim, the components and the traced walk all survive the round trip.
    await expect(canvas.brief.claim('c1')).toHaveValue(claim);
    await expect(canvas.brief.node('c1', 'n-2')).toBeChecked();
    await expect(canvas.brief.node('c1', 'n-3')).toBeChecked();
    await expect(canvas.brief.node('c1', 'n-1')).not.toBeChecked();
    await canvas.brief.expectState('c1', 'bound');
    await canvas.brief.expectTraced('c1', 2);
  });
});
