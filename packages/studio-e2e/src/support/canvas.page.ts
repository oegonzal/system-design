import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type { EdgeKind, NodeKind, OperationKind, PromptDto, Severity } from '@sysdesign/contracts';

import { createPracticeSession } from './backend';
import { BriefPanel } from './brief.panel';
import { CoachPanel } from './coach.panel';
import { FeedbackPanel, submissionStatus } from './feedback.panel';
import { NarrativePanel } from './narrative.panel';
import { PromptPanel } from './prompt.panel';
import { RevisionsPanel } from './revisions.panel';

/** The draft autosaves 1.5 s after the last edit; the PUT itself is quick. */
const DRAFT_TIMEOUT = 10_000;

/**
 * The palette advertises this MIME type on drag; the canvas drop handler
 * reads it back. Mirrored here rather than imported: pulling the constant out
 * of `studio-ui`'s component source would drag React into this package's
 * typecheck for one string.
 */
const NODE_DRAG_MIME = 'application/sysdesign-node';

/**
 * The practice workspace: palette, canvas, properties panel and toolbar, and
 * the dock as one page object per panel (prompt, brief, narrative, feedback,
 * coach, revisions), each opening its own tab. Node and edge ids are
 * deterministic (`n-1`, `n-2`, … / `e-1`, … in creation order), so specs can
 * name what they just made; criterion ids come from the prompt's rubric
 * (`c1…cN`).
 */
export class CanvasPage {
  readonly prompt: PromptPanel;
  readonly brief: BriefPanel;
  readonly narrative: NarrativePanel;
  readonly feedback: FeedbackPanel;
  readonly coach: CoachPanel;
  readonly revisions: RevisionsPanel;

  constructor(readonly page: Page) {
    this.prompt = new PromptPanel(page);
    this.brief = new BriefPanel(page);
    this.narrative = new NarrativePanel(page);
    this.feedback = new FeedbackPanel(page);
    this.coach = new CoachPanel(page);
    this.revisions = new RevisionsPanel(page);
  }

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

  // --- the palette ---------------------------------------------------------

  /**
   * The click path: every palette entry is a real button, and clicking adds
   * the block in the free place nearest the middle of what is visible — on
   * screen, and never over another block. Specs still `moveNode` each add to
   * a known spot so the layout they connect is deterministic.
   */
  async addFromPalette(kind: NodeKind): Promise<void> {
    await this.paletteItem(kind).click();
  }

  async filterBlocks(query: string): Promise<void> {
    await this.page.getByTestId('blocks-filter').fill(query);
  }

  blocksCategory(categoryId: string): Locator {
    return this.page.getByTestId(`blocks-category-${categoryId}`);
  }

  /**
   * The drag path. Playwright's mouse cannot produce HTML5 drag-and-drop, so
   * this dispatches the real DragEvent + DataTransfer sequence the palette
   * and canvas exchange. It is the same store action as the click path, plus
   * an exact position, for a block that must land beside a particular one.
   * `x`/`y` are the block's top-left corner on the pane; a point at or past
   * the pane's edge is pulled back until the block is on it.
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

  // --- the canvas surface --------------------------------------------------

  /**
   * Drag a node to a point given relative to the canvas frame. Grabs the
   * node by its icon, near the top-left corner, so the press lands on the
   * block itself rather than on a connection handle.
   */
  async moveNode(id: string, to: { x: number; y: number }): Promise<void> {
    const node = this.node(id);
    await node.hover({ position: { x: 24, y: 24 } });
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

  /**
   * The keyboard path. The caller must have just selected a node or edge on
   * the canvas (so focus sits on the element, not in a properties field —
   * React Flow ignores delete keys coming from inputs).
   */
  async deleteSelected(): Promise<void> {
    await this.page.keyboard.press('Delete');
  }

  async expectNodeCount(count: number): Promise<void> {
    await expect(this.canvas.locator('.react-flow__node')).toHaveCount(count);
  }

  /** The node's one-line meta summary — `service · 1 ops`, `database · 2 config`, … */
  async expectNodeMeta(nodeId: string, containsText: string): Promise<void> {
    await expect(this.node(nodeId)).toContainText(containsText);
  }

  /** The edge pill lives in React Flow's label-renderer overlay, not the <g>. */
  async expectEdgePill(text: string): Promise<void> {
    await expect(
      this.canvas.locator('.react-flow__edgelabel-renderer').getByText(text),
    ).toBeVisible();
  }

  /** A connection's pill: its carried operations or its label, drawn on its line. */
  edgePill(id: string): Locator {
    return this.page.getByTestId(`edge-pill-${id}`);
  }

  /** No two of these connections' pills overlap on screen: every label is read whole. */
  async expectPillsApart(edgeIds: readonly string[]): Promise<void> {
    const overlapping = async (): Promise<string[]> => {
      const boxes = await Promise.all(edgeIds.map((id) => this.edgePill(id).boundingBox()));
      const pairs: string[] = [];
      boxes.forEach((a, i) => {
        boxes.slice(i + 1).forEach((b, offset) => {
          if (a === null || b === null) return;
          const apart =
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y;
          if (!apart) pairs.push(`${edgeIds[i]} × ${edgeIds[i + 1 + offset]}`);
        });
      });
      return pairs;
    };
    await expect.poll(overlapping).toEqual([]);
  }

  /** A finding's highlight paints its severity onto the elements it names. */
  async expectNodeHighlighted(id: string, severity: Severity): Promise<void> {
    await expect(this.node(id)).toHaveAttribute('data-severity', severity);
  }

  async expectEdgeHighlighted(id: string, severity: Severity): Promise<void> {
    await expect(this.edge(id)).toHaveAttribute('data-severity', severity);
  }

  // --- the properties panel ------------------------------------------------

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

  get kindGuide(): Locator {
    return this.page.getByTestId('kind-guide');
  }

  get edgeCallStyle(): Locator {
    return this.properties.getByRole('combobox', { name: 'Call style' });
  }

  async setEdgeKind(kind: EdgeKind): Promise<void> {
    await this.edgeCallStyle.selectOption(kind);
  }

  /**
   * One free-form configuration entry on the selected node. The value is
   * typed by what is written — `3` a number, `true` a flag, anything else
   * text — and the row shows that type beside it.
   */
  async setConfig(key: string, value: string): Promise<void> {
    await this.page.getByTestId('config-key').fill(key);
    await this.page.getByTestId('config-value').fill(value);
    await this.page.getByTestId('config-add').click();
  }

  async expectConfigType(key: string, type: 'number' | 'boolean' | 'string'): Promise<void> {
    await expect(this.page.getByTestId(`config-row-${key}`)).toBeVisible();
    await expect(this.page.getByTestId(`config-type-${key}`)).toContainText(type);
  }

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
   * Substring label match: the checkbox is named `<name> · <kind> · <owner>`.
   */
  async toggleCarry(opName: string): Promise<void> {
    await this.properties.getByTestId('edge-carries-field').getByLabel(opName).click();
  }

  // --- the toolbar ---------------------------------------------------------

  async submit(): Promise<void> {
    await this.page.getByTestId('submit-revision').click();
  }

  /** What the workspace says when a submit never became a revision. */
  get submitError(): Locator {
    return this.page.getByTestId('submit-error');
  }

  async expectSubmitDisabled(): Promise<void> {
    await expect(this.page.getByTestId('submit-revision')).toBeDisabled();
  }

  /** The toolbar's word on the unsubmitted draft: unsaved, saving, saved, or not saved. */
  get draftStatus(): Locator {
    return this.page.getByTestId('draft-status');
  }

  async expectDraftStatus(status: 'unsaved' | 'saving' | 'saved' | 'failed'): Promise<void> {
    await expect(this.draftStatus).toHaveAttribute('data-status', status, {
      timeout: DRAFT_TIMEOUT,
    });
  }

  /**
   * Counts the draft saves the page sends from here on; the returned reader
   * gives the count so far. For asserting that something wrote nothing.
   */
  watchDraftSaves(): () => number {
    let saves = 0;
    this.page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname.endsWith('/draft')) {
        saves += 1;
      }
    });
    return () => saves;
  }

  /** Every block is on screen in full: inside the canvas frame, whatever the pan and zoom. */
  async expectDiagramFramed(nodeIds: readonly string[]): Promise<void> {
    for (const id of nodeIds) {
      // Not quite 1: a framed diagram may be scaled, and a scaled edge lands between pixels.
      await expect(this.node(id)).toBeInViewport({ ratio: 0.99 });
    }
  }

  /** The banner over a loaded revision; its one control hands the design back as a draft. */
  get readOnlyBanner(): Locator {
    return this.page.getByTestId('readonly-banner');
  }

  async restoreAsDraft(): Promise<void> {
    await this.readOnlyBanner.getByRole('button', { name: 'Restore as draft' }).click();
    await expect(this.readOnlyBanner).toHaveCount(0);
  }

  /** The toolbar's badge for the author's latest submission; see `submissionStatus`. */
  submissionStatus(revisionNumber: number): Locator {
    return submissionStatus(this.page, revisionNumber);
  }

  /** One click, one download: the run as a zip, where it landed and what it is called. */
  async exportRun(): Promise<{ path: string; filename: string }> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.getByTestId('export-run').click(),
    ]);
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.zip$/);
    return { path: await download.path(), filename };
  }
}

/**
 * Arrange a fresh practice session over the API and land on its canvas,
 * keeping the prompt. Defaults to an authored prompt whose rubric is `c1…c5`
 * (see `AUTHORED_MARKDOWN`), so specs can name criteria as literals.
 */
export async function openPracticeSession(
  page: Page,
  request: APIRequestContext,
  prompt?: PromptDto,
): Promise<{ canvas: CanvasPage; prompt: PromptDto; sessionId: string }> {
  const created = await createPracticeSession(request, prompt);
  await page.goto(`/practice/${created.session.id}`);
  const canvas = new CanvasPage(page);
  await canvas.ready();
  return { canvas, prompt: created.prompt, sessionId: created.session.id };
}

/**
 * The classic first sketch: client → service → database, all sync, nothing
 * redundant. Three nodes grade 64 under the stub, with an unhandled failure
 * at the database and an unbacked claim on the first connection.
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

/** What the stub grades the naive sketch: three nodes → 64, one more → 72. */
export const NAIVE_DESIGN_SCORE = 64;
export const NAIVE_DESIGN_PLUS_ONE_SCORE = 72;
