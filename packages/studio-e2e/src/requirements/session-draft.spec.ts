import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import { getSession } from '../support/backend';
import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The unsubmitted canvas is a draft kept with the session. It autosaves
 * shortly after the last edit, comes back on reload ahead of any revision,
 * is cleared by the submit it became, and the workspace asks before a
 * pending save is lost to a navigation.
 */
test.describe('the session draft', () => {
  test('[UX-15] the sketch autosaves, survives a reload as the draft, and is cleared by the submit it became', async ({
    page,
    request,
  }) => {
    const { canvas, sessionId } = await openPracticeSession(page, request);
    await expect(canvas.draftStatus).toHaveCount(0);

    await buildNaiveDesign(canvas);
    await canvas.expectDraftStatus('saved');
    const saved = await getSession(request, sessionId);
    expect(saved.draft?.graph.nodes.map((node) => node.id)).toEqual(['n-1', 'n-2', 'n-3']);

    // Back after a reload as the draft — not as a read-only revision — and
    // saved again once, since a restored draft is unsaved work until it is.
    await page.reload();
    await canvas.ready();
    await canvas.expectNodeCount(3);
    await expect(canvas.readOnlyBanner).toHaveCount(0);
    await canvas.expectDraftStatus('saved');

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    await expect.poll(async () => (await getSession(request, sessionId)).draft).toBeNull();
  });

  test('[UX-15] leaving while a save is pending asks first; once saved, leaving is free', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);
    const nav = new AppNav(page);

    // An edit, then a navigation inside the autosave window: the guard asks.
    // The handler is registered first — a dialog nobody answers freezes the
    // page, and the click would never return.
    let asked: string | null = null;
    page.once('dialog', (dialog) => {
      asked = dialog.message();
      void dialog.dismiss();
    });
    await canvas.addFromPalette('client');
    await nav.navLink('Prompts').click();
    await expect.poll(() => asked).toContain('still being saved');
    await expect(page).toHaveURL(/\/practice\//);

    // Saved: the same link now just navigates.
    await canvas.expectDraftStatus('saved');
    await nav.gotoPrompts();
  });
});
