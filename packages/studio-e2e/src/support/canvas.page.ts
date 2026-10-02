import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import type {
  CriterionResult,
  Decision,
  EdgeKind,
  ImproveIterationOutcome,
  NodeKind,
  OperationKind,
  PromptDto,
  Severity,
} from '@sysdesign/contracts';

import { createPracticeSession } from './backend';

/**
 * Submit → grade is normally under three seconds (the stub grader completes
 * a run in 400 ms and the UI polls every 1.2 s), but a cold Next.js dev
 * server or a busy parallel run deserves headroom.
 */
const EVAL_TIMEOUT = 30_000;

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
 * The practice workspace: palette, canvas, properties panel, toolbar and the
 * dock (prompt, brief, narrative, feedback, coach, revisions). Node and edge
 * ids are deterministic (`n-1`, `n-2`, … / `e-1`, … in creation order), so
 * specs can name what they just made; criterion ids come from the prompt's
 * rubric (`c1…cN`).
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

  /**
   * The toolbar's badge for the author's latest submission (`submitted #n ·
   * graded`): which revision, and where its grade stands. Addressed by the
   * revision it names, so a spec waits for *that* submission's badge — and by
   * its status as data, never by the words.
   */
  submissionStatus(revisionNumber: number): Locator {
    return this.page.locator(
      `[data-testid="submission-status"][data-revision="${revisionNumber}"]`,
    );
  }

  /**
   * The toolbar's badge for a run that failed, plus the feedback dock's
   * explanation — the author's sentence, with the run's own error folded
   * under it — and its grade-again control. The badge is the authoritative
   * signal that *this* revision failed.
   */
  async expectEvaluationFailed(revisionNumber: number, message: string): Promise<void> {
    await expect(this.submissionStatus(revisionNumber)).toHaveAttribute('data-status', 'failed', {
      timeout: EVAL_TIMEOUT,
    });
    await this.feedbackTab.click();
    await expect(this.page.getByTestId('evaluation-error')).toContainText(message, {
      timeout: EVAL_TIMEOUT,
    });
  }

  /** The feedback dock's way back from a failed grade: the same revision, graded again in place. */
  async retryEvaluation(): Promise<void> {
    await this.feedbackTab.click();
    await this.page.getByTestId('retry-evaluation').click();
  }

  /** One click, one download: the run as a zip. */
  async exportRun(): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.getByTestId('export-run').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    return download.path();
  }

  // --- the dock ------------------------------------------------------------

  dockTab(name: 'Prompt' | 'Brief' | 'Narrative' | 'Feedback' | 'Coach' | 'Revisions'): Locator {
    return this.page.getByRole('tab', { name });
  }

  get promptTab(): Locator {
    return this.dockTab('Prompt');
  }

  /** The prompt pane's badge for a prompt that was archived under the session. */
  get promptArchivedBadge(): Locator {
    return this.page.getByTestId('prompt-archived');
  }

  get briefTab(): Locator {
    return this.dockTab('Brief');
  }

  get narrativeTab(): Locator {
    return this.dockTab('Narrative');
  }

  get feedbackTab(): Locator {
    return this.dockTab('Feedback');
  }

  get coachTab(): Locator {
    return this.dockTab('Coach');
  }

  get revisionsTab(): Locator {
    return this.dockTab('Revisions');
  }

  // --- the design brief ----------------------------------------------------

  bindingRow(criterionId: string): Locator {
    return this.page.getByTestId(`binding-row-${criterionId}`);
  }

  bindingClaim(criterionId: string): Locator {
    return this.page.getByTestId(`binding-claim-${criterionId}`);
  }

  bindingNode(criterionId: string, nodeId: string): Locator {
    return this.page.getByTestId(`binding-node-${criterionId}-${nodeId}`);
  }

  /** The claim in the author's words — creates the binding on first use. */
  async setBindingClaim(criterionId: string, claim: string): Promise<void> {
    await this.briefTab.click();
    await this.bindingClaim(criterionId).fill(claim);
  }

  /** Tick one of the components on the canvas as holding the criterion. */
  async toggleBindingNode(criterionId: string, nodeId: string): Promise<void> {
    await this.briefTab.click();
    await this.bindingNode(criterionId, nodeId).click();
  }

  /** The row's chip: `empty` → `incomplete` → `bound` (claim + at least one component). */
  async expectBindingState(
    criterionId: string,
    state: 'empty' | 'incomplete' | 'bound',
  ): Promise<void> {
    await expect(this.page.getByTestId(`binding-state-${criterionId}`)).toHaveAttribute(
      'data-state',
      state,
    );
  }

  /** The tracer is folded away until a path exists; open it once per binding. */
  async openFlowTracer(criterionId: string): Promise<void> {
    await this.briefTab.click();
    await this.page.getByTestId(`flow-open-${criterionId}`).click();
  }

  /**
   * Trace a request by taking the offered hops in order.
   *
   * Note what this does NOT do: click edges on the canvas. The tracer offers
   * only edges that continue the walk, as buttons in the dock — so a broken
   * path is unrepresentable, and this sidesteps the bezier hit-target problem
   * `selectEdge` has to work around.
   */
  async traceFlow(criterionId: string, edgeIds: readonly string[]): Promise<void> {
    await this.briefTab.click();
    for (const edgeId of edgeIds) {
      await this.page.getByTestId(`flow-hop-${criterionId}-${edgeId}`).click();
    }
  }

  async expectFlowTraced(criterionId: string, hops: number): Promise<void> {
    await expect(this.page.getByTestId(`flow-status-${criterionId}`)).toContainText(
      `Traced · ${hops} ${hops === 1 ? 'hop' : 'hops'}`,
    );
  }

  // --- the design narrative ------------------------------------------------

  get narrativeOverview(): Locator {
    return this.page.getByTestId('narrative-overview');
  }

  componentRationale(nodeId: string): Locator {
    return this.page.getByTestId(`narrative-rationale-${nodeId}`);
  }

  criterionNarration(criterionId: string): Locator {
    return this.page.getByTestId(`narrative-narration-${criterionId}`);
  }

  /** The big-picture overview slot. No submit — the narrative rides the next revision. */
  async setOverview(text: string): Promise<void> {
    await this.narrativeTab.click();
    await this.narrativeOverview.fill(text);
  }

  /** One component's rationale, keyed to its node id. */
  async explainComponent(nodeId: string, prose: string): Promise<void> {
    await this.narrativeTab.click();
    await this.componentRationale(nodeId).fill(prose);
  }

  /** One criterion's narration, keyed to its id. */
  async narrateCriterion(criterionId: string, prose: string): Promise<void> {
    await this.narrativeTab.click();
    await this.criterionNarration(criterionId).fill(prose);
  }

  // --- the feedback dock ---------------------------------------------------

  /**
   * Waits until the given revision is graded and its score summary is on
   * screen. The toolbar badge (`submitted #n · graded`) is the authoritative
   * signal that *this* revision finished — the score summary alone could
   * still be showing the previous one during a resubmit.
   */
  async expectEvaluationComplete(revisionNumber: number): Promise<void> {
    await expect(this.submissionStatus(revisionNumber)).toHaveAttribute('data-status', 'complete', {
      timeout: EVAL_TIMEOUT,
    });
    await this.feedbackTab.click();
    await expect(this.page.getByTestId('score-summary')).toBeVisible({ timeout: EVAL_TIMEOUT });
  }

  /** Whose feedback the tab shows: the revision by number, badged when the coach wrote it. */
  get feedbackSubject(): Locator {
    return this.page.getByTestId('feedback-subject');
  }

  /** The feedback tab's line for a canvas that has moved on to the draft; absent while it shows the revision. */
  get feedbackOffCanvas(): Locator {
    return this.page.getByTestId('feedback-off-canvas');
  }

  async expectOverall(score: number): Promise<void> {
    await expect(this.page.getByTestId('overall-score')).toHaveText(String(score));
  }

  async expectDecision(decision: Decision): Promise<void> {
    await expect(this.page.getByTestId('decision-badge')).toHaveText(decision);
  }

  /** The meter for one of the pipeline's own dimensions, by its wire key. */
  dimensionMeter(dimension: string): Locator {
    return this.page.locator(`[data-dimension="${dimension}"]`).getByRole('meter');
  }

  /**
   * A dimension the loop actually assessed. `not-assessed-<dimension>` is
   * rendered in place of the meter when the score is null, so its absence
   * beside a visible meter is the assertion.
   */
  async expectDimensionScored(dimension: string): Promise<void> {
    await expect(this.dimensionMeter(dimension)).toBeVisible();
    await expect(this.page.getByTestId(`not-assessed-${dimension}`)).toHaveCount(0);
  }

  criterionResult(criterionId: string): Locator {
    return this.page.getByTestId(`criterion-result-${criterionId}`);
  }

  async expectCriterionResult(criterionId: string, result: CriterionResult): Promise<void> {
    await expect(this.criterionResult(criterionId)).toHaveAttribute('data-result', result);
  }

  /** The controller's own sentence for its decision, under the score. */
  get decisionReason(): Locator {
    return this.page.getByTestId('decision-reason');
  }

  /** A finding by the loop's structural key — `unhandled_failure|node.3`. */
  finding(id: string): Locator {
    return this.page.getByTestId(`finding-${id}`);
  }

  /** The places a finding names, each labelled from the graded revision (`n-3 · database · Database`). */
  findingLocations(id: string): Locator {
    return this.finding(id).getByTestId('finding-location');
  }

  /** Clicking a finding's title highlights the elements it names on the canvas. */
  async clickFinding(id: string): Promise<void> {
    await this.feedbackTab.click();
    await this.page.getByTestId(`finding-select-${id}`).click();
  }

  // --- the coach -----------------------------------------------------------

  /**
   * Hand the draft to the coach for up to `iterations` revise rounds. The
   * workspace confirms through a native dialog, accepted here; the control
   * is enabled only once the grader has reported itself available.
   */
  async startCoach(iterations: number): Promise<void> {
    await this.coachTab.click();
    const run = this.page.getByTestId('improve-run');
    await expect(run).toBeEnabled();
    await this.page.getByTestId('improve-iterations').selectOption(String(iterations));
    this.page.once('dialog', (dialog) => void dialog.accept());
    await run.click();
  }

  coachIteration(iteration: number): Locator {
    return this.page.getByTestId(`improve-iteration-${iteration}`);
  }

  /** What became of the iteration in the studio — the row's outcome attribute. */
  async expectCoachOutcome(iteration: number, outcome: ImproveIterationOutcome): Promise<void> {
    await expect(this.coachIteration(iteration)).toHaveAttribute('data-outcome', outcome, {
      timeout: EVAL_TIMEOUT,
    });
  }

  coachIterationReason(iteration: number): Locator {
    return this.coachIteration(iteration).getByTestId('improve-iteration-reason');
  }

  /** How many lessons from earlier runs the coach was handed, as the panel says it. */
  get coachRecallSummary(): Locator {
    return this.page.getByTestId('coach-recall-summary');
  }

  /** The recalled lessons, one per row — hidden until `showRecalledLessons`. */
  get recalledLessons(): Locator {
    return this.page.getByTestId('coach-recall-lesson');
  }

  async showRecalledLessons(): Promise<void> {
    const toggle = this.page.getByTestId('coach-recall-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  /** The coach panel's report of a run that failed. */
  get coachError(): Locator {
    return this.page.getByTestId('improvement-error');
  }

  /** The coach panel's reason for a disabled control. */
  get coachUnavailable(): Locator {
    return this.page.getByTestId('improver-unavailable');
  }

  async expectCoachDisabled(reason: RegExp): Promise<void> {
    await this.coachTab.click();
    await expect(this.page.getByTestId('improve-run')).toBeDisabled();
    await expect(this.coachUnavailable).toHaveText(reason);
  }

  async expectCoachStopped(): Promise<void> {
    await expect(this.page.getByTestId('improvement-stopped')).toBeVisible({
      timeout: EVAL_TIMEOUT,
    });
  }

  /** Load the best imported iteration from the coach tab; the canvas turns read-only. */
  async loadBestRevision(): Promise<void> {
    await this.coachTab.click();
    await this.page.getByTestId('load-best-revision').click();
    await expect(this.page.getByTestId('readonly-banner')).toBeVisible();
  }

  // --- the revision timeline -----------------------------------------------

  revisionChip(revisionNumber: number): Locator {
    return this.page.getByTestId(`revision-chip-${revisionNumber}`);
  }

  /** A revision the coach wrote carries an explicit AI badge in the timeline. */
  async expectAssistantRevisionInTimeline(revisionNumber: number): Promise<void> {
    await this.revisionsTab.click();
    await expect(this.revisionChip(revisionNumber).getByText('AI', { exact: true })).toBeVisible({
      timeout: EVAL_TIMEOUT,
    });
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
            // The score carries its own testid — the chip may also hold an AI
            // origin badge, so "the only span" is not safe to assume.
            const scoreSpan = chip.locator('[data-testid="revision-score"]');
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
