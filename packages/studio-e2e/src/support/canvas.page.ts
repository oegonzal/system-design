import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { EdgeKind, NodeKind, OperationKind } from '@sysdesign/contracts';

import { createPracticeSession } from './backend';

/**
 * Submit → verdict is normally under two seconds (the worker polls every
 * 300ms in this suite), but a cold Next.js dev server or a busy parallel run
 * deserves headroom.
 */
const EVAL_TIMEOUT = 30_000;

/**
 * The palette advertises this MIME type on drag; the canvas drop handler
 * reads it back. Mirrored here rather than imported: pulling the constant out
 * of `studio-ui`'s component source would drag React into this package's
 * typecheck for one string.
 */
const NODE_DRAG_MIME = 'application/sysdesign-node';

/**
 * The practice workspace: palette, canvas, properties panel, toolbar and the
 * feedback dock. Node/edge ids are deterministic (`n-1`, `n-2`, … / `e-1`, …
 * in creation order), so specs can name what they just made.
 */
export class CanvasPage {
  constructor(readonly page: Page) {}

  get canvas(): Locator {
    return this.page.getByTestId('sd-canvas');
  }

  get pane(): Locator {
    return this.canvas.locator('.react-flow__pane');
  }

  get properties(): Locator {
    return this.page.getByTestId('properties-panel');
  }

  node(id: string): Locator {
    return this.page.getByTestId(`node-${id}`);
  }

  edge(id: string): Locator {
    return this.page.getByTestId(`edge-${id}`);
  }

  paletteItem(kind: NodeKind): Locator {
    return this.page.getByTestId(`palette-${kind}`);
  }

  /** The canvas loads client-side behind a skeleton; wait for the real pane. */
  async ready(): Promise<void> {
    await expect(this.pane).toBeVisible();
    await expect(this.paletteItem('client')).toBeVisible();
  }

  /**
   * The click path: every palette entry is a real button, and clicking adds
   * the block at a staggered default spot. Consecutive adds overlap, so specs
   * follow each add with `moveNode` before adding the next.
   */
  async addFromPalette(kind: NodeKind): Promise<void> {
    await this.paletteItem(kind).click();
  }

  /** Drag a node's centre to a point given relative to the canvas frame. */
  async moveNode(id: string, to: { x: number; y: number }): Promise<void> {
    const node = this.node(id);
    await node.hover();
    const frame = await this.canvas.boundingBox();
    if (!frame) throw new Error('canvas frame has no bounding box');
    await this.page.mouse.down();
    await this.page.mouse.move(frame.x + to.x, frame.y + to.y, { steps: 8 });
    await this.page.mouse.up();
  }

  /**
   * Draw a connection the way a person does: press on the source's bottom
   * handle, drag, release on the target's top handle. React Flow follows the
   * real pointer events, so this is `mouse` rather than `dragTo`.
   */
  async connect(sourceId: string, targetId: string): Promise<void> {
    const source = this.node(sourceId).locator('.react-flow__handle.source');
    const target = this.node(targetId).locator('.react-flow__handle.target');
    await source.hover();
    await this.page.mouse.down();
    const box = await target.boundingBox();
    if (!box) throw new Error(`target handle of ${targetId} has no bounding box`);
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await this.page.mouse.up();
  }

  async selectNode(id: string): Promise<void> {
    await this.node(id).click();
  }

  /**
   * Edges are thin bezier curves whose bounding-box centre often lies off the
   * path, which fails Playwright's hit-target check. A dispatched click walks
   * the same React handler (`onEdgeClick` → store select) without depending
   * on curve geometry.
   */
  async selectEdge(id: string): Promise<void> {
    await expect(this.edge(id)).toBeAttached();
    await this.edge(id).dispatchEvent('click');
  }

  async setNodeLabel(value: string): Promise<void> {
    await this.properties.getByLabel('Label', { exact: true }).fill(value);
  }

  /**
   * By role, not by label: the design's fields wrap the control in its
   * `<label>`, so the label's *text* includes every option — an exact
   * label-text match can never succeed for a select. The accessible name is
   * computed correctly, so the role engine finds it.
   */
  async setNodeKind(kind: NodeKind): Promise<void> {
    await this.properties.getByRole('combobox', { name: 'Kind' }).selectOption(kind);
  }

  get edgeCallStyle(): Locator {
    return this.properties.getByRole('combobox', { name: 'Call style' });
  }

  async setEdgeKind(kind: EdgeKind): Promise<void> {
    await this.edgeCallStyle.selectOption(kind);
  }

  /**
   * The keyboard path. The caller must have just selected a node or edge on
   * the canvas (so focus sits on the element, not in a properties field —
   * React Flow ignores delete keys coming from inputs).
   */
  async deleteSelected(): Promise<void> {
    await this.page.keyboard.press('Delete');
  }

  // --- declared interfaces -----------------------------------------------

  /**
   * Declare an operation on the selected node: click "Add operation", then
   * fill the freshly appended row. Scoped to the row because the panel has a
   * second "Kind" combobox (the node's own) outside it.
   */
  async addOperation(name: string, kind: OperationKind): Promise<void> {
    await this.properties.getByRole('button', { name: 'Add operation' }).click();
    const row = this.properties.locator('[data-testid^="operation-row-"]').last();
    await row.getByLabel('Name', { exact: true }).fill(name);
    await row.getByRole('combobox', { name: 'Kind' }).selectOption(kind);
  }

  /**
   * Toggle one declared operation's carry checkbox on the selected edge.
   * Substring label match: the checkbox is named `<name> · <kind>`.
   */
  async toggleCarry(opName: string): Promise<void> {
    await this.properties.getByTestId('edge-carries-field').getByLabel(opName).click();
  }

  /** The edge pill lives in React Flow's label-renderer overlay, not the <g>. */
  async expectEdgePill(text: string): Promise<void> {
    await expect(
      this.canvas.locator('.react-flow__edgelabel-renderer').getByText(text),
    ).toBeVisible();
  }

  /** The node's one-line meta summary — `service · 1 ops`, `queue · 2 types`, … */
  async expectNodeMeta(nodeId: string, containsText: string): Promise<void> {
    await expect(this.node(nodeId)).toContainText(containsText);
  }

  async submit(): Promise<void> {
    await this.page.getByTestId('submit-revision').click();
  }

  async expectNodeCount(count: number): Promise<void> {
    await expect(this.canvas.locator('.react-flow__node')).toHaveCount(count);
  }

  /** A finding's highlight paints its severity onto the affected node. */
  async expectNodeHighlighted(id: string): Promise<void> {
    await expect(this.node(id)).toHaveAttribute(
      'data-severity',
      /^(critical|high|medium|low|info)$/,
    );
  }

  // --- the feedback dock -------------------------------------------------

  get feedbackTab(): Locator {
    return this.page.getByRole('tab', { name: 'Feedback' });
  }

  get revisionsTab(): Locator {
    return this.page.getByRole('tab', { name: 'Revisions' });
  }

  /**
   * Waits until the given revision is graded and its score summary is on
   * screen. The toolbar badge (`rev #n · evaluated`) is the authoritative
   * signal that *this* revision finished — the score summary alone could
   * still be showing the previous one during a resubmit.
   */
  async expectEvaluationComplete(revisionNumber: number): Promise<void> {
    await expect(this.page.getByText(`rev #${revisionNumber} · evaluated`)).toBeVisible({
      timeout: EVAL_TIMEOUT,
    });
    await this.feedbackTab.click();
    await expect(this.page.getByTestId('score-summary')).toBeVisible({ timeout: EVAL_TIMEOUT });
  }

  get findingItems(): Locator {
    return this.page.locator('li[data-testid^="finding-"]');
  }

  findingItem(title: string): Locator {
    return this.findingItems.filter({ hasText: title });
  }

  async expectFindingCount(predicate: (count: number) => boolean): Promise<void> {
    await expect
      .poll(async () => predicate(await this.findingItems.count()), { timeout: EVAL_TIMEOUT })
      .toBe(true);
  }

  /** Clicking a finding's title highlights its elements on the canvas. */
  async clickFinding(title: string): Promise<void> {
    await this.findingItem(title).getByRole('button', { name: title }).click();
  }

  async previewFix(title: string): Promise<void> {
    await this.findingItem(title).getByRole('button', { name: 'Preview fix' }).click();
  }

  get suggestionControls(): Locator {
    return this.page.getByTestId('suggestion-controls');
  }

  async acceptSuggestion(): Promise<void> {
    await this.page.getByTestId('accept-suggestion').click();
  }

  /**
   * Reads every revision chip in the timeline and demands strictly rising
   * overall scores in submission order. Polls, because the timeline refreshes
   * its grades asynchronously after an evaluation completes.
   */
  async expectScoreTrendIncreasing(): Promise<void> {
    await this.revisionsTab.click();
    await expect
      .poll(
        async () => {
          const chips = await this.page.locator('[data-testid^="revision-chip-"]').all();
          if (chips.length < 2) return `only ${chips.length} revision(s) in the timeline`;

          const scored: Array<{ revision: number; score: number }> = [];
          for (const chip of chips) {
            const testId = (await chip.getAttribute('data-testid')) ?? '';
            const revision = Number(testId.replace('revision-chip-', ''));
            // The score renders in the chip's only <span>; an ungraded chip has none.
            const scoreSpan = chip.locator('span');
            if ((await scoreSpan.count()) === 0) return `revision #${revision} is not graded yet`;
            scored.push({ revision, score: Number(await scoreSpan.first().textContent()) });
          }

          scored.sort((a, b) => a.revision - b.revision);
          const rising = scored.every(
            (entry, index) => index === 0 || entry.score > scored[index - 1].score,
          );
          const trail = scored.map((entry) => `#${entry.revision}:${entry.score}`).join(' → ');
          return rising ? 'strictly increasing' : `not increasing: ${trail}`;
        },
        { timeout: EVAL_TIMEOUT },
      )
      .toBe('strictly increasing');
  }

  /**
   * The drag path. Playwright's mouse cannot produce HTML5 drag-and-drop, so
   * this dispatches the real DragEvent + DataTransfer sequence the palette
   * and canvas exchange. Exactly one spec exercises this; everything else
   * uses the click path, which is the same store action.
   */
  async dragFromPalette(kind: NodeKind, x: number, y: number): Promise<void> {
    await expect(this.paletteItem(kind)).toBeVisible();
    await expect(this.pane).toBeVisible();
    await this.page.evaluate(
      ({ kind: dragKind, x: dropX, y: dropY, mime }) => {
        const source = document.querySelector<HTMLElement>(`[data-testid="palette-${dragKind}"]`);
        const flow = document.querySelector<HTMLElement>('[data-testid="sd-canvas"] .react-flow');
        if (!source || !flow) throw new Error('palette entry or canvas not in the DOM');

        const dataTransfer = new DataTransfer();
        dataTransfer.setData(mime, dragKind);
        const rect = flow.getBoundingClientRect();
        const clientX = rect.left + dropX;
        const clientY = rect.top + dropY;
        const options = { bubbles: true, cancelable: true, dataTransfer, clientX, clientY };

        source.dispatchEvent(new DragEvent('dragstart', options));
        flow.dispatchEvent(new DragEvent('dragover', options));
        flow.dispatchEvent(new DragEvent('drop', options));
        source.dispatchEvent(new DragEvent('dragend', options));
      },
      { kind, x, y, mime: NODE_DRAG_MIME },
    );
  }
}

/** Arrange a fresh practice session over the API and land on its canvas. */
export async function openPracticeSession(
  page: Page,
  request: APIRequestContext,
): Promise<CanvasPage> {
  const { session } = await createPracticeSession(request);
  await page.goto(`/practice/${session.id}`);
  const canvas = new CanvasPage(page);
  await canvas.ready();
  return canvas;
}

/**
 * The classic first sketch: client → service → database, all sync, nothing
 * redundant. Guaranteed to earn findings — every generated prompt carries an
 * availability NFR, so the unreplicated database alone draws a critical.
 */
export async function buildNaiveDesign(canvas: CanvasPage): Promise<void> {
  await canvas.addFromPalette('client'); // n-1
  await canvas.moveNode('n-1', { x: 300, y: 80 });
  await canvas.addFromPalette('service'); // n-2
  await canvas.moveNode('n-2', { x: 300, y: 230 });
  await canvas.addFromPalette('database'); // n-3
  await canvas.moveNode('n-3', { x: 300, y: 380 });
  await canvas.connect('n-1', 'n-2'); // e-1
  await canvas.connect('n-2', 'n-3'); // e-2
  await canvas.expectNodeCount(3);
}
