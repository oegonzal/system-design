import { expect, test } from '@playwright/test';

import { openPracticeSession } from '../support/canvas.page';

/**
 * Interface contracts on the real workspace: declare an operation in the
 * properties panel, carry it on a connection, and watch both surfaces — the
 * node's meta line and the edge's pill — say so before the revision goes
 * over the wire.
 */
test.describe('interface modeling', () => {
  test('[UX-5] declares operations on a service and carries them on a connection', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);

    await canvas.addFromPalette('client'); // n-1
    await canvas.moveNode('n-1', { x: 300, y: 80 });
    await canvas.addFromPalette('service'); // n-2
    await canvas.moveNode('n-2', { x: 300, y: 320 });

    await canvas.selectNode('n-2');
    await canvas.addOperation('placeOrder', 'command');
    await canvas.expectNodeMeta('n-2', '1 ops');

    await canvas.connect('n-1', 'n-2'); // e-1
    await canvas.selectEdge('e-1');
    await canvas.toggleCarry('placeOrder');
    await canvas.expectEdgePill('placeOrder');

    // The declarations survive the wire: the API accepts the revision (no
    // 4xx), so the toolbar's revision chip appears.
    await canvas.submit();
    await expect(page.getByText(/rev #1/)).toBeVisible();
  });
});
