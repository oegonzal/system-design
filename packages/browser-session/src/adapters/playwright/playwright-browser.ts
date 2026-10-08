import { join } from 'node:path';

import {
  actionRefs,
  elementKindOf,
  observationFingerprint,
  pageObservationSchema,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';

import { ActionFailed, type BrowserAction, type BrowserPort } from '../../core/ports';
import {
  decodeAriaSnapshot,
  ancestryOf,
  landmarkRolesOf,
  settledSnapshot,
  subtreeText,
  unreadSnapshotLines,
} from './aria-snapshot';
import { readElementFacts, readWithinBudget } from './element-facts';
import {
  failedWholesale,
  toObservation,
  toObservedElement,
  type PageReading,
  mainUnrendered,
} from './observation-reading';

/** The reading facts of a read taken only to compare: never reported. */
const UNSETTLED = { reads: 1, settled: false, durationMs: 0 } as const;

/**
 * The browser as Playwright drives it: a persistent Chrome profile, so the
 * site stays signed in between sessions, observed through the accessibility
 * snapshot Playwright mints refs for and acted on through those same refs.
 * A ref is good for one observation: the adapter keeps the elements of the
 * last one, and an action on any other ref is refused before Playwright is
 * asked. Nothing here knows what the page is for.
 */
export interface PlaywrightBrowserOptions {
  profilesDir: string;
  /** `chrome` for the installed Chrome; undefined for the Chromium Playwright bundles (the specs). */
  channel: string | undefined;
  actionTimeoutMs?: number;
  /** How long a read that differs from the one before waits before the next; the specs shorten it. */
  settleRetryMs?: number;
}

export const CHROME_CHANNEL = 'chrome';
export const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
/**
 * How long the observer waits for the document to settle before each read of
 * the page, and how long it waits between reads that came back without a ref
 * or that differ from the read before. `settledSnapshot` owns how many reads
 * are taken for a ref-less answer; `readPage` how many for a page still
 * changing.
 */
export const SETTLE_TIMEOUT_MS = 10_000;
export const SETTLE_RETRY_MS = 400;

/**
 * What one observation may spend: the timeout on a single element's facts read,
 * and the budget for every facts read of every read the observation takes.
 * Both are declared here rather than inherited from the action timeout — see
 * `readWithinBudget` for the live run that measured why a phase the engine's
 * rails cannot interrupt must bound itself. The budget is one deadline for
 * the whole observation, not one per read: with reads taken until two agree,
 * a budget per read would be the same hazard multiplied.
 */
export const FACTS_TIMEOUT_MS = 1_000;
export const OBSERVE_BUDGET_MS = 20_000;

/**
 * How many times the page is read when a read fails wholesale. A read fails
 * wholesale when every ref the snapshot handed out came back dead — the page
 * moved between the snapshot and the facts, so the map is stale — or when the
 * grammar read no node at all from a snapshot with lines in it. Neither is a
 * page with nothing on it, and reporting one as the other is what left a
 * producer planning against a search-results page described as empty.
 * Measured live on 2026-10-03: 135 elements seen, 135 reads dead.
 */
export const PAGE_READS = 3;

/**
 * How many further reads a page that keeps changing is given before it is
 * reported as it stands. A page is reported only once two reads in a row
 * agree on every fact the goal renders — the same identity the session's
 * stall rail compares.
 *
 * Measured live on 2026-10-07: a search landing page was observed a second
 * after its own reload, before its search control had rendered, and
 * reported without it — thirteen steps in a row, each after a fresh reload;
 * and a job page was observed between the click that opened its application
 * dialog and the dialog's render. A read taken while the page is still
 * arriving is a fact about the moment, not about the page.
 */
const STABLE_READS = 4;

const SCROLL_PX = 600;

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);

export class PlaywrightBrowser implements BrowserPort {
  private context: BrowserContext | null = null;
  private known = new Map<string, ObservedElement>();

  constructor(private readonly options: PlaywrightBrowserOptions) {}

  async open(profile: string, { headed }: { headed: boolean }): Promise<void> {
    this.context = await chromium.launchPersistentContext(join(this.options.profilesDir, profile), {
      channel: this.options.channel,
      headless: !headed,
      viewport: null,
    });
    this.context.setDefaultTimeout(this.options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);
    if (this.context.pages().length === 0) await this.context.newPage();
  }

  /** The page in front: the newest, so a link that opened a tab is followed. */
  get page(): Page {
    if (this.context === null) throw new ActionFailed('page', 'the browser is not open');
    const pages = this.context.pages();
    const page = pages[pages.length - 1];
    if (page === undefined) throw new ActionFailed('page', 'the browser has no page open');
    return page;
  }

  private get settleRetryMs(): number {
    return this.options.settleRetryMs ?? SETTLE_RETRY_MS;
  }

  /**
   * The page as the accessibility tree reports it, read once the document has
   * settled. A read taken mid-navigation comes back with no refs — or with no
   * body to read at all — so it is taken again rather than reported as a page
   * with nothing on it.
   */
  private snapshot(): Promise<string> {
    const page = this.page;
    const read = async (): Promise<string | null> => {
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: SETTLE_TIMEOUT_MS });
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
    return settledSnapshot(read, () => page.waitForTimeout(this.settleRetryMs));
  }

  /** One read: the snapshot, the elements whose facts came back with the scope and words the tree gives each, and what did not. */
  private async readOnce(deadline: number): Promise<PageReading> {
    const page = this.page;
    const snapshot = await this.snapshot();
    const nodes = decodeAriaSnapshot(snapshot);
    const ancestry = ancestryOf(nodes);
    const interactive = nodes.flatMap((node, index) =>
      node.ref !== null && elementKindOf(node.role) !== 'static' ? [{ node, index }] : [],
    );
    const { facts, unread } = await readWithinBudget(
      interactive.map(({ node }) => node.ref ?? ''),
      (ref) => readElementFacts(page.locator(`aria-ref=${ref}`), FACTS_TIMEOUT_MS),
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
      elements,
      unreadElements: unread,
      unreadSnapshotLines: unreadSnapshotLines(snapshot, nodes),
      focusedScope: focused < 0 ? null : (ancestry[focused]?.scope ?? null),
      landmarks: landmarkRolesOf(nodes),
    };
  }

  /** The page, read again while a read fails wholesale; what the last read reached, either way. */
  private async readWhole(deadline: number): Promise<PageReading> {
    let reading = await this.readOnce(deadline);
    for (let read = 2; read <= PAGE_READS && failedWholesale(reading); read += 1) {
      await this.page.waitForTimeout(this.settleRetryMs);
      reading = await this.readOnce(deadline);
    }
    return reading;
  }

  /**
   * The page once two reads in a row agree on every fact the goal renders, or
   * the last read taken when it never settled within `STABLE_READS`. Agreement
   * is the contracts' own fingerprint, so what the adapter calls settled is
   * exactly what the session's stall rail calls unchanged — less what the
   * read could not reach: two reads of one unchanged page can disagree on
   * `unread` only because the reader ran out of budget, which is a fact about
   * the read and never about the page. The reads taken, whether they settled
   * and the time spent ride on the observation, so a live session can size
   * the reader from data.
   */
  private async readPage(): Promise<PageObservation> {
    const startedAt = Date.now();
    const deadline = startedAt + OBSERVE_BUDGET_MS;
    const agreement = (reading: PageReading): string =>
      observationFingerprint({ ...toObservation(reading, UNSETTLED), unread: null });
    let reading = await this.readWhole(deadline);
    let reads = 1;
    let settled = false;
    for (let read = 1; read <= STABLE_READS && !settled; read += 1) {
      await this.page.waitForTimeout(this.settleRetryMs);
      const again = await this.readWhole(deadline);
      reads += 1;
      // Two reads agreeing on a page whose main has nothing in it yet agree on
      // the chrome, not the page: read again. Measured 2026-10-08, three times.
      settled = agreement(again) === agreement(reading) && !mainUnrendered(again);
      reading = again;
    }
    return toObservation(reading, { reads, settled, durationMs: Date.now() - startedAt });
  }

  async observe(): Promise<PageObservation> {
    const observation = pageObservationSchema.parse(await this.readPage());
    this.known = new Map(observation.elements.map((element) => [element.ref, element]));
    return observation;
  }

  async act(action: BrowserAction): Promise<void> {
    const label = `${action.kind}${'ref' in action && action.ref !== null ? ` ${action.ref}` : ''}`;
    const targets = actionRefs(action).map((ref) => this.resolve(ref, label));
    try {
      await this.perform(action, targets[0] ?? null);
    } catch (error) {
      if (error instanceof ActionFailed) throw error;
      throw new ActionFailed(label, messageOf(error));
    }
  }

  async highlight(ref: string): Promise<void> {
    const locator = this.locate(this.resolve(ref, 'highlight').ref);
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate((el) => {
      const style = (el as HTMLElement).style;
      style.outline = '3px solid #f59e0b';
      style.outlineOffset = '2px';
    });
  }

  async readValue(ref: string): Promise<string | null> {
    try {
      return await this.locate(this.resolve(ref, 'readValue').ref).evaluate((el) => {
        if (el instanceof HTMLSelectElement) {
          const chosen = el.selectedOptions[0];
          return chosen ? chosen.textContent?.trim() || chosen.value : null;
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
        return el.textContent?.trim() ?? null;
      });
    } catch {
      return null;
    }
  }

  async screenshot(): Promise<Uint8Array> {
    return new Uint8Array(await this.page.screenshot({ type: 'png' }));
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.known.clear();
    if (context !== null) await context.close();
  }

  private locate(ref: string): Locator {
    return this.page.locator(`aria-ref=${ref}`);
  }

  /** The element the last observation listed under the ref, or a refusal: refs never outlive their observation. */
  private resolve(ref: string, label: string): ObservedElement {
    const element = this.known.get(ref);
    if (element === undefined) {
      throw new ActionFailed(label, `${ref} is not an element of the last observation`);
    }
    return element;
  }

  private async perform(action: BrowserAction, target: ObservedElement | null): Promise<void> {
    const page = this.page;
    switch (action.kind) {
      case 'navigate':
        await page.goto(action.url, { waitUntil: 'domcontentloaded' });
        return;
      case 'click':
        await this.locate(action.ref).click();
        return;
      case 'fill':
        await this.locate(action.ref).fill(action.value);
        return;
      case 'select':
        await this.select(target, action.ref, action.option);
        return;
      case 'press':
        await page.keyboard.press(action.key === 'Space' ? ' ' : action.key);
        return;
      case 'scroll':
        if (action.ref === null) {
          await page.mouse.wheel(0, action.direction === 'down' ? SCROLL_PX : -SCROLL_PX);
        } else {
          await this.locate(action.ref).scrollIntoViewIfNeeded();
        }
        return;
      case 'waitFor':
        if (action.until === 'url') {
          await page.waitForURL((url) => url.href.includes(action.value));
        } else if (action.until === 'text') {
          await page.getByText(action.value).first().waitFor({ state: 'visible' });
        } else {
          await this.locate(action.value).waitFor({ state: 'visible' });
        }
        return;
    }
  }

  /** A `<select>` takes the option by label; a radio group checks the named radio; anything else opens and picks. */
  private async select(target: ObservedElement | null, ref: string, option: string): Promise<void> {
    const locator = this.locate(ref);
    if (target?.inputType === 'select') {
      await locator.selectOption({ label: option });
      return;
    }
    if (target?.role === 'radiogroup') {
      await locator.getByRole('radio', { name: option, exact: true }).check();
      return;
    }
    if (target?.role === 'radio') {
      await locator.check();
      return;
    }
    await locator.click();
    await this.page.getByRole('option', { name: option, exact: true }).first().click();
  }
}
