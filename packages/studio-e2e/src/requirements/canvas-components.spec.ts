import { expect, test } from '@playwright/test';
import { NODE_KINDS } from '@sysdesign/contracts';

import { openPracticeSession } from '../support/canvas.page';

/**
 * The interactive canvas, against the real workspace: each test arranges its
 * own practice session over the API and drives the palette, properties panel
 * and React Flow surface the way a person would.
 */
test.describe('interactive design canvas', () => {
  test('[UX-1] the palette offers every node kind in the contract', async ({ page, request }) => {
    const canvas = await openPracticeSession(page, request);

    for (const kind of NODE_KINDS) {
      await expect(canvas.paletteItem(kind)).toBeVisible();
    }
    // …and nothing beyond the contract's vocabulary.
    await expect(page.locator('[data-testid^="palette-"]')).toHaveCount(NODE_KINDS.length);
  });

  test('[UX-2] adds, connects, edits and deletes blocks on the canvas', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);

    await canvas.addFromPalette('client'); // n-1
    await canvas.moveNode('n-1', { x: 280, y: 100 });
    await canvas.addFromPalette('service'); // n-2
    await canvas.moveNode('n-2', { x: 280, y: 320 });
    await canvas.expectNodeCount(2);

    await canvas.connect('n-1', 'n-2'); // e-1
    await expect(canvas.edge('e-1')).toBeAttached();

    await canvas.selectNode('n-2');
    await canvas.setNodeLabel('Order Service');
    await expect(canvas.node('n-2')).toContainText('Order Service');
    await canvas.setNodeKind('worker');
    await expect(canvas.node('n-2')).toHaveAttribute('data-kind', 'worker');

    // Deleting the node takes its connection with it.
    await canvas.selectNode('n-2');
    await canvas.deleteSelected();
    await canvas.expectNodeCount(1);
    await expect(canvas.edge('e-1')).toHaveCount(0);
  });

  test('[UX-3] edges distinguish sync from async calls', async ({ page, request }) => {
    const canvas = await openPracticeSession(page, request);

    await canvas.addFromPalette('service'); // n-1
    await canvas.moveNode('n-1', { x: 280, y: 100 });
    await canvas.addFromPalette('database'); // n-2
    await canvas.moveNode('n-2', { x: 280, y: 320 });
    await canvas.connect('n-1', 'n-2'); // e-1

    // A fresh connection is a sync request/response call.
    await expect(canvas.edge('e-1')).toHaveAttribute('data-kind', 'sync');

    await canvas.selectEdge('e-1');
    await expect(canvas.edgeCallStyle).toHaveValue('sync');
    await canvas.setEdgeKind('async');

    // The rendered edge switches over, not just the form.
    await expect(canvas.edge('e-1')).toHaveAttribute('data-kind', 'async');
    await expect(canvas.edgeCallStyle).toHaveValue('async');
  });

  test('[UX-2] drops a palette block at an exact spot (HTML5 drag-and-drop)', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);

    await canvas.dragFromPalette('cache', 360, 200);

    await canvas.expectNodeCount(1);
    await expect(canvas.node('n-1')).toHaveAttribute('data-kind', 'cache');
  });
});
