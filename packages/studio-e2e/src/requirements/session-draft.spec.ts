import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import { createPracticeSession, getSession, saveDraft } from '../support/backend';
import { buildNaiveDesign, CanvasPage, openPracticeSession } from '../support/canvas.page';

/**
 * The unsubmitted canvas is a draft kept with the session. It autosaves
 * shortly after the last edit, comes back on reload ahead of any revision —
 * framed on screen, and as saved work, so opening a session writes nothing —
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
    // already saved: the server just handed it over, so nothing is written
    // back and the session keeps the time of its last real edit.
    const draftSaves = canvas.watchDraftSaves();
    await page.reload();
    await canvas.ready();
    await canvas.expectNodeCount(3);
    await expect(canvas.readOnlyBanner).toHaveCount(0);
    await canvas.expectDraftStatus('saved');
    expect(draftSaves()).toBe(0);
    expect((await getSession(request, sessionId)).updatedAt).toBe(saved.updatedAt);

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    await expect.poll(async () => (await getSession(request, sessionId)).draft).toBeNull();
  });

  test('[UX-15] a session reopened on its draft frames the whole diagram, and the first edit is the first save', async ({
    page,
    request,
  }) => {
    // A draft drawn far from the canvas's origin: at the resting view none of
    // it would be on screen.
    const { session } = await createPracticeSession(request);
    await saveDraft(request, session.id, {
      graph: {
        nodes: [
          { id: 'n-1', kind: 'client', label: 'Client', position: { x: 1400, y: 900 } },
          { id: 'n-2', kind: 'service', label: 'Service', position: { x: 1660, y: 1080 } },
          { id: 'n-3', kind: 'database', label: 'Database', position: { x: 1920, y: 1260 } },
        ],
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
          { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
        ],
      },
      brief: null,
      narrative: null,
    });

    const canvas = new CanvasPage(page);
    const draftSaves = canvas.watchDraftSaves();
    await page.goto(`/practice/${session.id}`);
    await canvas.ready();
    await canvas.expectNodeCount(3);
    await canvas.expectDiagramFramed(['n-1', 'n-2', 'n-3']);
    await canvas.expectDraftStatus('saved');
    expect(draftSaves()).toBe(0);

    // A block added by click lands in view too, and is the first thing saved.
    await canvas.addFromPalette('cache'); // n-4
    await canvas.expectDiagramFramed(['n-4']);
    await canvas.expectDraftStatus('saved');
    expect(draftSaves()).toBe(1);
  });

  test('[UX-15] a draft too large to frame whole opens on its blocks, never on a blank canvas', async ({
    page,
    request,
  }) => {
    // A cluster near the origin and one block dropped 3,000 units away: framed
    // whole it would need a zoom below the floor, and centring it at the
    // floor shows only the empty space between them.
    const cluster = [0, 1, 2, 3, 4, 5].map((index) => ({
      id: `n-${index + 1}`,
      kind: 'service' as const,
      label: `Service ${index + 1}`,
      position: { x: (index % 3) * 260, y: Math.floor(index / 3) * 180 },
    }));
    const { session } = await createPracticeSession(request);
    await saveDraft(request, session.id, {
      graph: {
        nodes: [
          ...cluster,
          { id: 'n-7', kind: 'cache', label: 'Far cache', position: { x: 3623, y: 2633 } },
        ],
        edges: [],
      },
      brief: null,
      narrative: null,
    });

    const canvas = new CanvasPage(page);
    await page.goto(`/practice/${session.id}`);
    await canvas.ready();
    await canvas.expectNodeCount(7);
    await canvas.expectDiagramFramed(cluster.map((node) => node.id));
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
