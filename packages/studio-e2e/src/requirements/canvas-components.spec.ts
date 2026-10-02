import { expect, test } from '@playwright/test';
import { NODE_KIND_CATEGORIES, NODE_KINDS } from '@sysdesign/contracts';

import { createPracticeSession, saveDraft } from '../support/backend';
import { CanvasPage, openPracticeSession } from '../support/canvas.page';

/**
 * The interactive canvas, against the real workspace: each test arranges its
 * own practice session over the API and drives the palette, properties panel
 * and React Flow surface the way a person would.
 */
test.describe('interactive design canvas', () => {
  test('[UX-1] the palette offers every node kind in the contract', async ({ page, request }) => {
    const { canvas } = await openPracticeSession(page, request);

    for (const kind of NODE_KINDS) {
      await expect(canvas.paletteItem(kind)).toBeVisible();
    }
    // …and nothing beyond the contract's vocabulary.
    await expect(page.locator('[data-testid^="palette-"]')).toHaveCount(NODE_KINDS.length);

    // The very last entry is reachable and usable — the palette scrolls
    // internally instead of relying on page scroll that clipped it before.
    await canvas.addFromPalette(NODE_KINDS[NODE_KINDS.length - 1]); // n-1
    await canvas.expectNodeCount(1);
  });

  test('[UX-4] the palette groups blocks by category and filters them by name', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);

    for (const category of NODE_KIND_CATEGORIES) {
      await expect(canvas.blocksCategory(category.id)).toBeVisible();
    }

    await canvas.filterBlocks('cache');
    await expect(canvas.paletteItem('cache')).toBeVisible();
    await expect(canvas.paletteItem('client')).toHaveCount(0);
    await expect(canvas.blocksCategory('clients-edge')).toHaveCount(0);

    await canvas.filterBlocks('');
    await expect(canvas.paletteItem('client')).toBeVisible();
  });

  test('[UX-2] adds, connects, edits and deletes blocks on the canvas', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);

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
    const { canvas } = await openPracticeSession(page, request);

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
    const { canvas } = await openPracticeSession(page, request);

    await canvas.dragFromPalette('cache', 360, 200);

    await canvas.expectNodeCount(1);
    await expect(canvas.node('n-1')).toHaveAttribute('data-kind', 'cache');
  });

  test('[UX-7] a selected block explains what its kind is for and when to use it', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);

    await canvas.addFromPalette('queue'); // n-1, selected on add
    await expect(canvas.kindGuide).toBeVisible();
    await expect(canvas.kindGuide).not.toBeEmpty();
    const queueGuide = (await canvas.kindGuide.textContent()) ?? '';

    // The guide follows the kind, not the block: change it and the text changes.
    await canvas.setNodeKind('cache');
    await expect(canvas.kindGuide).not.toHaveText(queueGuide);
  });

  test('[UX-9] a free-form configuration key is typed by what is written — a number, a flag, or text', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);

    await canvas.addFromPalette('database'); // n-1, selected on add
    await expect(page.getByTestId('config-section')).toBeVisible();

    await canvas.setConfig('replicas', '3');
    await canvas.expectConfigType('replicas', 'number');
    await canvas.setConfig('synchronous_commit', 'true');
    await canvas.expectConfigType('synchronous_commit', 'boolean');
    await canvas.setConfig('region', 'us-east-1');
    await canvas.expectConfigType('region', 'string');

    // The block's own meta line counts what was declared.
    await canvas.expectNodeMeta('n-1', '3 config');

    // A key already set is refused, not silently overwritten.
    await page.getByTestId('config-key').fill('replicas');
    await expect(page.getByTestId('config-error')).toContainText('already set');
    await expect(page.getByTestId('config-add')).toBeDisabled();
  });

  test('[UX-2] two connections whose lines cross in one gap keep their labels apart', async ({
    page,
    request,
  }) => {
    // Two rows of blocks joined corner to corner: both lines cross the gap
    // between the rows at one point, where both pills would sit.
    const { session } = await createPracticeSession(request);
    await saveDraft(request, session.id, {
      graph: {
        nodes: [
          { id: 'n-1', kind: 'client', label: 'Client', position: { x: 0, y: 0 } },
          { id: 'n-2', kind: 'gateway', label: 'API Gateway', position: { x: 320, y: 0 } },
          { id: 'n-3', kind: 'service', label: 'Service', position: { x: 0, y: 220 } },
          { id: 'n-4', kind: 'database', label: 'Database', position: { x: 320, y: 220 } },
        ],
        edges: [
          { id: 'e-1', source: 'n-2', target: 'n-3', kind: 'sync', label: 'route' },
          { id: 'e-2', source: 'n-1', target: 'n-4', kind: 'sync', label: 'reads and writes' },
        ],
      },
      brief: null,
      narrative: null,
    });

    const canvas = new CanvasPage(page);
    await page.goto(`/practice/${session.id}`);
    await canvas.ready();
    await canvas.expectNodeCount(4);
    await canvas.expectEdgePill('route');
    await canvas.expectEdgePill('reads and writes');
    await canvas.expectPillsApart(['e-1', 'e-2']);
  });
});
