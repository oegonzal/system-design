import { expect, test } from '@playwright/test';
import {
  ALL_PLATFORM_SERVICE_IDS,
  NODE_KINDS,
  PLATFORM_IDS,
  platformCatalogue,
} from '@sysdesign/contracts';

import { authorPrompt } from '../support/backend';
import { openPracticeSession } from '../support/canvas.page';
import { submissionStatus } from '../support/feedback.panel';

const [PLATFORM] = PLATFORM_IDS;
const catalogue = platformCatalogue(PLATFORM);

/**
 * A prompt that declares a platform: its services shelve ahead of the roles,
 * a block drawn as one keeps the service beside its role, and a hop carries
 * its own config — all of it declared data the graders read.
 */
test.describe('platform services on the canvas', () => {
  test('[UX-31] the palette shelves the platform’s services first, by its own categories, and every role after them', async ({
    page,
    request,
  }) => {
    const prompt = await authorPrompt(request, { platform: PLATFORM });
    const { canvas } = await openPracticeSession(page, request, prompt);

    for (const category of catalogue.categories) {
      await expect(canvas.platformShelf(PLATFORM, category.id)).toBeVisible();
    }
    // One entry per service (a prefix count would also catch the `service-mesh` role).
    const ids = ALL_PLATFORM_SERVICE_IDS.filter((id) =>
      catalogue.services.some((service) => service.id === id),
    );
    expect(ids).toHaveLength(catalogue.services.length);
    for (const id of ids) {
      await expect(canvas.paletteService(id)).toBeVisible();
    }
    // The roles are still all there, after the platform's shelves.
    await expect(page.locator('[data-testid^="palette-"]')).toHaveCount(
      NODE_KINDS.length + catalogue.services.length,
    );

    // A service is found by a word it answers to that no role spells.
    await canvas.filterBlocks('kafka');
    await expect(canvas.paletteService('aws.msk')).toBeVisible();
    await expect(canvas.paletteItem('client')).toHaveCount(0);
  });

  test('[UX-32] the way in can be drawn: a certificate manager is a service on the shelf, drawn as its role', async ({
    page,
    request,
  }) => {
    const prompt = await authorPrompt(request, { platform: PLATFORM });
    const { canvas } = await openPracticeSession(page, request, prompt);

    await canvas.addServiceFromPalette('aws.acm'); // n-1, selected on add
    await expect(canvas.node('n-1')).toHaveAttribute('data-kind', 'certificate-manager');
    await canvas.expectNodeMeta('n-1', 'ACM · certificate-manager');
  });

  test('[UX-31] a block drawn as a service shows the service beside its role, offers only the roles it plays, and is a plain role again once the service is taken off', async ({
    page,
    request,
  }) => {
    const prompt = await authorPrompt(request, { platform: PLATFORM });
    const { canvas } = await openPracticeSession(page, request, prompt);

    await canvas.addServiceFromPalette('aws.sqs'); // n-1, selected on add
    await expect(canvas.node('n-1')).toHaveAttribute('data-kind', 'queue');
    await canvas.expectNodeService('n-1', 'aws.sqs');
    await canvas.expectNodeMeta('n-1', 'SQS · queue');
    await expect(canvas.nodeService).toHaveValue('aws.sqs');
    await expect(canvas.kindGuide).toContainText(
      catalogue.services.find((service) => service.id === 'aws.sqs')?.what ?? '',
    );

    // The service's knobs are offered; a chip fills the key, the author writes the value.
    await canvas.clickConfigHint('dlq');
    await expect(page.getByTestId('config-key')).toHaveValue('dlq');
    await page.getByTestId('config-value').fill('true');
    await page.getByTestId('config-add').click();
    await canvas.expectConfigType('dlq', 'boolean');

    // While a service is named, Kind offers only the roles it plays; taking the
    // service off frees the kind, and the block is a plain role again.
    await expect(
      canvas.properties.getByRole('combobox', { name: 'Kind' }).locator('option'),
    ).toHaveCount(1);
    await canvas.setNodeService('');
    await canvas.expectNodeService('n-1', null);
    await canvas.setNodeKind('cache');
    await expect(canvas.node('n-1')).toHaveAttribute('data-kind', 'cache');
  });

  test('[EVAL-6] a sync call and an async hop join one pair, the hop declares its config, and the design submits', async ({
    page,
    request,
  }) => {
    const prompt = await authorPrompt(request, { platform: PLATFORM });
    const { canvas } = await openPracticeSession(page, request, prompt);

    await canvas.addServiceFromPalette('aws.lambda'); // n-1
    await canvas.moveNode('n-1', { x: 280, y: 100 });
    await canvas.addServiceFromPalette('aws.sqs'); // n-2
    await canvas.moveNode('n-2', { x: 280, y: 320 });
    await canvas.connect('n-1', 'n-2'); // e-1
    await canvas.selectEdge('e-1');
    await canvas.setEdgeKind('async');
    await canvas.clickConfigHint('dlq');
    await page.getByTestId('config-value').fill('true');
    await page.getByTestId('config-add').click();
    await canvas.expectConfigType('dlq', 'boolean');
    await canvas.connect('n-1', 'n-2'); // e-2, the sync call beside the async hop
    await expect(canvas.edge('e-2')).toHaveAttribute('data-kind', 'sync');

    // The API takes the service and the hop's config: the design is stored and graded.
    await canvas.submit();
    await expect(submissionStatus(page, 1)).toBeVisible();
  });
});
