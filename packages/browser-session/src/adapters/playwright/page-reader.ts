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
  decodeAriaSnapshot,
  landmarkRolesOf,
  settledSnapshot,
  subtreeText,
  unreadSnapshotLines,
} from './aria-snapshot';
import { readWithinBudget } from './budgeted-read';
import { busyCheck } from './busy-check';
import { readElementFacts } from './element-facts';
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
        return await page.locator('body').ariaSnapshot({ mode: 'ai' });
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
    const elements: ObservedElement[] = interactive.flatMap(({ node, index }) => {
      const read = facts.get(node.ref ?? '');
      return read === undefined
        ? []
        : [
            toObservedElement(
              node,
              read,
              ancestry[index]?.scope ?? null,
              subtreeText(nodes, index),
              ancestry[index]?.landmark ?? null,
            ),
          ];
    });
    const focused = nodes.findIndex((node) => node.attributes['active'] === true);
    return {
      url: page.url(),
      title: await page.title(),
      snapshot,
      nodes,
      elements,
      unreadElements: unread,
      unreadSnapshotLines: unreadSnapshotLines(snapshot, nodes),
      focusedScope: focused < 0 ? null : (ancestry[focused]?.scope ?? null),
      landmarks: landmarkRolesOf(nodes),
      ...(await busyCheck(page)),
    };
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
