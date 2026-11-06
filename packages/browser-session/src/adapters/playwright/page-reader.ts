/**
 * How the adapter reads a page: the accessibility snapshot once the document
 * has settled, each interactive element's facts within one budget, read again
 * while a read fails wholesale, and reported only once two reads in a row
 * agree. Every wait and every count is the observe policy's.
 */
import {
  elementKindOf,
  observationFingerprint,
  type ObservationReading,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';
import type { Page } from 'playwright';

import {
  ancestryOf,
  type Ancestry,
  decodeAriaSnapshot,
  landmarkRolesOf,
  settledSnapshot,
  type SnapshotNode,
  subtreeText,
  unreadSnapshotLines,
} from '../../core/snapshot/aria-snapshot';
import { readWithinBudget } from './budgeted-read';
import { busyCheck } from './busy-check';
import { readElementFacts } from './element-facts';
import { readFileControls } from './file-controls';
import { GROUP_OPTIONS, readNameGroups, type ChoiceBox } from './name-groups';
import { readRadioGroup } from './radio-group';
import type { ObservePolicy } from './observe-policy';
import {
  failedWholesale,
  mainUnrendered,
  toObservation,
  toObservedElement,
  type PageReading,
} from './observation-reading';

/** The reading facts of a read taken only to compare: never reported. */
const UNSETTLED: ObservationReading = { reads: 1, settled: false, durationMs: 0, busy: [] };

export class PageReader {
  constructor(
    private readonly page: () => Page,
    private readonly policy: ObservePolicy,
  ) {}

  /**
   * The page once two reads in a row agree on every fact the goal renders, or
   * the last read taken when it never settled within `stableReads`. Agreement
   * is the contracts' own fingerprint, so what the adapter calls settled is
   * exactly what the session's stall rail calls unchanged — less what the
   * read could not reach: two reads of one unchanged page can disagree on
   * `unread` only because the reader ran out of budget, which is a fact about
   * the read and never about the page. The reads taken, whether they settled
   * and the time spent ride on the observation, so a live session can size
   * the reader from data.
   */
  async read(): Promise<{ observation: PageObservation; reading: PageReading }> {
    const startedAt = Date.now();
    const deadline = startedAt + this.policy.observeBudgetMs;
    const agreement = (reading: PageReading): string =>
      observationFingerprint({ ...toObservation(reading, UNSETTLED), unread: null });
    let reading = await this.readWhole(deadline);
    let reads = 1;
    let settled = false;
    const busy = [reading.busyRead];
    for (let read = 1; read <= this.policy.stableReads && !settled; read += 1) {
      await this.pause();
      const again = await this.readWhole(deadline);
      reads += 1;
      busy.push(again.busyRead);
      // Two reads agreeing on a page whose main has nothing in it yet agree on
      // the chrome, not the page: read again. Measured 2026-10-08, three times.
      // The same for a dialog in front that says it is still loading.
      settled =
        agreement(again) === agreement(reading) && !mainUnrendered(again) && !again.scopeBusy;
      reading = again;
    }
    return {
      observation: toObservation(reading, {
        reads,
        settled,
        durationMs: Date.now() - startedAt,
        busy,
      }),
      reading,
    };
  }

  private pause(): Promise<void> {
    return this.page().waitForTimeout(this.policy.settleRetryMs);
  }

  /**
   * The page as the accessibility tree reports it, read once the document has
   * settled. A read taken mid-navigation comes back with no refs — or with no
   * body to read at all — so it is taken again rather than reported as a page
   * with nothing on it.
   */
  private snapshot(): Promise<string> {
    const page = this.page();
    const read = async (): Promise<string | null> => {
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: this.policy.settleTimeoutMs });
      } catch {
        // A page that never reports a load state is still read: what it has is what the session gets.
      }
      try {
        // Bounded: a frame that never answers would hold the read for the action timeout.
        return await page
          .locator('body')
          .ariaSnapshot({ mode: 'ai', timeout: this.policy.snapshotTimeoutMs });
      } catch {
        // Mid-navigation there is no body to match; another read is the answer.
        return null;
      }
    };
    return settledSnapshot(read, () => this.pause(), this.policy.emptySnapshotReads);
  }

  /** One read: the snapshot, the elements whose facts came back with the scope and words the tree gives each, and what did not. */
  private async readOnce(deadline: number): Promise<PageReading> {
    const page = this.page();
    const snapshot = await this.snapshot();
    const nodes = decodeAriaSnapshot(snapshot);
    const ancestry = ancestryOf(nodes);
    const interactive = nodes.flatMap((node, index) =>
      node.ref !== null && elementKindOf(node.role) !== 'static' ? [{ node, index }] : [],
    );
    const { facts, unread } = await readWithinBudget(
      interactive.map(({ node }) => node.ref ?? ''),
      (ref) => readElementFacts(page.locator(`aria-ref=${ref}`), this.policy.factsTimeoutMs),
      () => Date.now(),
      Math.max(0, deadline - Date.now()),
    );
    const listed = interactive.flatMap(({ node, index }) => {
      const read = facts.get(node.ref ?? '');
      return read === undefined
        ? []
        : [
            {
              index,
              element: toObservedElement(
                node,
                read,
                ancestry[index]?.scope ?? null,
                subtreeText(nodes, index),
                ancestry[index]?.landmark ?? null,
              ),
            },
          ];
    });
    const boxes = await this.choiceBoxes(nodes, ancestry, deadline);
    const placed = new Set(boxes.flatMap((box) => [box.index, ...box.options]));
    // A box stands where it sits in the page, and its options are its own, never fields apart from it.
    const elements: ObservedElement[] = [
      ...listed.filter(({ index }) => !placed.has(index)),
      ...boxes,
    ]
      .sort((a, b) => a.index - b.index)
      .map(({ element }) => element);
    const files = await readFileControls(page, this.policy.factsTimeoutMs);
    const focused = nodes.findIndex((node) => node.attributes['active'] === true);
    return {
      url: page.url(),
      title: await page.title(),
      snapshot,
      nodes,
      elements: [...elements, ...files.elements],
      fileControls: files.refs,
      choiceBoxes: boxes.map(({ box }) => box),
      unreadElements: unread,
      unreadSnapshotLines: unreadSnapshotLines(snapshot, nodes),
      focusedScope: focused < 0 ? null : (ancestry[focused]?.scope ?? null),
      landmarks: landmarkRolesOf(nodes),
      ...(await busyCheck(page)),
    };
  }

  /**
   * The groups the page makes by name alone and the checkboxes it draws
   * itself (`name-groups.ts`), each as one element under its box's ref: a
   * group read as the group it is, named by nothing of its own — its question
   * is the words before its box, its context — and a drawn checkbox named as
   * the tree names it, seen where its box is seen and holding what its
   * checkbox holds. A box whose facts never come back leaves its options as
   * the tree lists them.
   */
  private async choiceBoxes(
    nodes: readonly SnapshotNode[],
    ancestry: readonly Ancestry[],
    deadline: number,
  ): Promise<{ index: number; element: ObservedElement; options: number[]; box: ChoiceBox }[]> {
    const page = this.page();
    const timeout = this.policy.factsTimeoutMs;
    const { groups, drawn } = await readNameGroups(page, nodes, timeout, deadline);
    const at = (index: number) => ({
      scope: ancestry[index]?.scope ?? null,
      landmark: ancestry[index]?.landmark ?? null,
    });
    const asGroups = groups.map(async ({ kind, box, options }) => {
      const node = nodes[box];
      if (node?.ref === null || node === undefined) return null;
      const facts = await readElementFacts(page.locator(`aria-ref=${node.ref}`), timeout, {
        asGroup: GROUP_OPTIONS[kind],
      });
      if (facts === null) return null;
      const { scope, landmark } = at(box);
      // A radio group is one by the HTML standard; a group of checkboxes is chosen from as a list is.
      const role = kind === 'radio' ? 'radiogroup' : 'listbox';
      const element = toObservedElement({ ...node, role, name: '' }, facts, scope, '', landmark);
      return { index: box, element, options, box: { ref: node.ref, kind, drawn: false } };
    });
    const asCheckboxes = drawn.map(async ({ box, option }) => {
      const holder = nodes[box];
      const checkbox = nodes[option];
      if (holder?.ref === null || holder === undefined || checkbox === undefined) return null;
      const located = page.locator(`aria-ref=${holder.ref}`);
      const seen = await readElementFacts(located, timeout);
      // What it holds is its checkbox's own state, never the words beside it.
      const held = await readRadioGroup(located, timeout, GROUP_OPTIONS.checkbox);
      const own = held?.options[0];
      if (seen === null || held === null || own === undefined) return null;
      const facts = {
        ...seen,
        inputType: 'checkbox',
        value: own.checked ? 'checked' : 'unchecked',
        options: null,
        required: held.required,
        invalid: held.invalid,
        disabled: seen.disabled || own.disabled,
        // A checkbox its label names says what it is; the words before its box are its question only when nothing names it.
        context: (checkbox.name ?? '') === '' ? seen.context : null,
      };
      const { scope, landmark } = at(box);
      const element = toObservedElement(
        { ...checkbox, ref: holder.ref },
        facts,
        scope,
        '',
        landmark,
      );
      return {
        index: box,
        element,
        options: [option],
        box: { ref: holder.ref, kind: 'checkbox' as const, drawn: true },
      };
    });
    const read = await Promise.all([...asGroups, ...asCheckboxes]);
    return read.flatMap((box) => (box === null ? [] : [box]));
  }

  /** The page, read again while a read fails wholesale; what the last read reached, either way. */
  private async readWhole(deadline: number): Promise<PageReading> {
    let reading = await this.readOnce(deadline);
    for (let read = 2; read <= this.policy.wholesaleReads && failedWholesale(reading); read += 1) {
      await this.pause();
      reading = await this.readOnce(deadline);
    }
    return reading;
  }
}
