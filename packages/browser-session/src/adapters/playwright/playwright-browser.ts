import { join } from 'node:path';

import {
  ACTION_EFFECTS,
  actionRefs,
  pageObservationSchema,
  type LandmarkRole,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';

import {
  ActionFailed,
  type BrowserAction,
  type BrowserPort,
  type PagesClosed,
  type SuppliedDocument,
} from '../../core/ports';
import { performAction } from './action-performer';
import {
  decodeAriaSnapshot,
  landmarkWords,
  type SnapshotNode,
} from '../../core/snapshot/aria-snapshot';
import { readElementFacts } from './element-facts';
import { FILE_CONTROLS } from './file-controls';
import { GROUP_OPTIONS, type ChoiceBox } from './name-groups';
import { readRadioGroup } from './radio-group';
import { readTypedChoices } from './typed-choice';
import type { ObservePolicy } from './observe-policy';
import { PageReader } from './page-reader';
import { markedScreenshot } from './page-marker';
import { actionFailureOf } from './playwright-errors';

/**
 * The browser as Playwright drives it: a persistent Chrome profile, so the
 * site stays signed in between sessions, observed through the accessibility
 * snapshot Playwright mints refs for and acted on through those same refs.
 * A ref is good for one observation: the adapter keeps the elements of the
 * last one, and an action on any other ref is refused before Playwright is
 * asked. The pages open when the browser opened, or when a unit's pages were
 * last closed, are kept; `closeOpenedPages` closes the rest, so a unit of
 * work's pages close with it. Nothing here knows what the page is for; how it
 * waits on and reads a page is the observe policy's.
 */
export interface PlaywrightBrowserOptions {
  profilesDir: string;
  /** `chrome` for the installed Chrome; undefined for the Chromium Playwright bundles (the specs). */
  channel: string | undefined;
  observe: ObservePolicy;
}

export const CHROME_CHANNEL = 'chrome';

/**
 * How the browser is launched. The session owns its own end: Ctrl-C and a
 * termination reach the engine through its stop signal, which ends the
 * session after the step in flight and closes the browser on the way out.
 * Playwright's own handlers for the same signals would kill the browser and
 * exit the process at once, before any closing write — measured 2026-10-12:
 * session 79947605 ended with exit code 130 and its row still running at step
 * 16, the interruption logged and nothing closed.
 */
export const launchOptions = (
  options: Pick<PlaywrightBrowserOptions, 'channel'>,
  headed: boolean,
) => ({
  channel: options.channel,
  headless: !headed,
  viewport: null,
  handleSIGINT: false,
  handleSIGTERM: false,
});

export class PlaywrightBrowser implements BrowserPort {
  private context: BrowserContext | null = null;
  private known = new Map<string, ObservedElement>();
  /** The tree of the last observation reported: what `wordsUnder` reads, so a unit's statement is the page as the plan saw it. */
  private tree: readonly SnapshotNode[] = [];
  /** The pages kept open: those present at `open`, then those present after each `closeOpenedPages`. */
  private kept = new Set<Page>();
  /** The file each declared document is read from, by name, as the run supplied them. */
  private documents = new Map<string, string>();
  /** The hidden file controls of the last observation, by the adapter's own ref: which control each is, in document order. */
  private fileControls = new Map<string, number>();
  /** The boxes the last observation listed in place of the choices they hold, by ref: what each holds. */
  private choiceBoxes = new Map<string, ChoiceBox>();
  private readonly reader: PageReader;

  constructor(private readonly options: PlaywrightBrowserOptions) {
    this.reader = new PageReader(() => this.page, options.observe);
  }

  async open(
    profile: string,
    { headed, documents }: { headed: boolean; documents: readonly SuppliedDocument[] },
  ): Promise<void> {
    this.documents = new Map(documents.map((document) => [document.name, document.path]));
    this.context = await chromium.launchPersistentContext(
      join(this.options.profilesDir, profile),
      launchOptions(this.options, headed),
    );
    this.context.setDefaultTimeout(this.options.observe.actionTimeoutMs);
    if (this.context.pages().length === 0) await this.context.newPage();
    this.kept = new Set(this.context.pages());
  }

  /** The page in front: the newest, so a link that opened a tab is followed. */
  get page(): Page {
    if (this.context === null) throw new ActionFailed('page', 'the browser is not open');
    const pages = this.context.pages();
    const page = pages[pages.length - 1];
    if (page === undefined) throw new ActionFailed('page', 'the browser has no page open');
    return page;
  }

  async observe(): Promise<PageObservation> {
    const read = await this.reader.read();
    const observation = pageObservationSchema.parse(read.observation);
    this.known = new Map(observation.elements.map((element) => [element.ref, element]));
    this.fileControls = new Map(read.reading.fileControls.map((file) => [file.ref, file.nth]));
    this.choiceBoxes = new Map(read.reading.choiceBoxes.map((box) => [box.ref, box]));
    this.tree = read.reading.nodes;
    return observation;
  }

  wordsUnder(landmark: LandmarkRole): readonly string[] {
    return landmarkWords(this.tree, landmark);
  }

  async act(action: BrowserAction): Promise<void> {
    const label = `${action.kind}${'ref' in action && action.ref !== null ? ` ${action.ref}` : ''}`;
    const listed = actionRefs(action).map((ref) => this.resolve(ref, label));
    // Each target as it is on the page now: a field the page drew again since the observation is aimed at anew.
    const live = new Map<string, string>();
    for (const target of listed) live.set(target.ref, await this.liveRef(target));
    const targets = listed.map((target) => ({
      ...target,
      ref: live.get(target.ref) ?? target.ref,
    }));
    const opened = this.pageOpenedBy(
      action,
      await this.declaresNewPage(action, targets[0] ?? null),
    );
    try {
      await performAction(
        {
          page: this.page,
          locate: (ref) => this.locate(live.get(ref) ?? ref),
          documentPath: (name) => this.documentPath(name),
          scrollPx: this.options.observe.scrollPx,
          optionWaitMs: this.options.observe.optionWaitMs,
          settleRetryMs: this.options.observe.settleRetryMs,
          choiceBoxOf: (ref) => this.choiceBoxes.get(ref) ?? null,
        },
        action,
        targets[0] ?? null,
      );
    } catch (error) {
      if (error instanceof ActionFailed) throw error;
      throw new ActionFailed(label, actionFailureOf(error));
    }
    await opened;
  }

  /**
   * The page an action may open, listened for from before the action runs —
   * a tab registers with Playwright some hundreds of milliseconds after the
   * click that opened it — waited for up to the declared wait, and read to
   * its document once it registers, so the next observation is of that page
   * and never of the page the action was taken on. A click inside a link
   * that declares a new page waits the longer `newPageWaitMs`; an action
   * that opens nothing costs the wait; one that cannot open a page costs nothing.
   */
  private pageOpenedBy(action: BrowserAction, declared: boolean): Promise<void> {
    if (this.context === null || !ACTION_EFFECTS[action.kind].opens) return Promise.resolve();
    const { pageOpenWaitMs, newPageWaitMs, settleTimeoutMs } = this.options.observe;
    return this.context
      .waitForEvent('page', { timeout: declared ? newPageWaitMs : pageOpenWaitMs })
      .then((page) => page.waitForLoadState('domcontentloaded', { timeout: settleTimeoutMs }))
      .catch(() => undefined);
  }

  /**
   * Whether a click lands inside a link that declares it opens a new page —
   * `target="_blank"` on the link — read from the element before the click;
   * an element that cannot be read declares nothing.
   */
  private async declaresNewPage(
    action: BrowserAction,
    target: ObservedElement | null,
  ): Promise<boolean> {
    if (action.kind !== 'click' || target === null) return false;
    return this.locate(target.ref)
      .evaluate(
        (el) =>
          el.closest('a[href], area[href]')?.getAttribute('target')?.trim().toLowerCase() ===
          '_blank',
        undefined,
        { timeout: this.options.observe.factsTimeoutMs },
      )
      .catch(() => false);
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
      const listed = this.resolve(ref, 'readValue');
      const located = this.locate(listed.ref);
      const box = this.choiceBoxes.get(listed.ref);
      // A checkbox the page drew holds what its checkbox holds — checked, or not — never the words beside it.
      if (box?.drawn === true) {
        const own = (await readRadioGroup(located, undefined, GROUP_OPTIONS.checkbox))?.options[0];
        return own === undefined ? null : own.checked ? 'checked' : 'unchecked';
      }
      const facts = await readElementFacts(located, undefined, {
        asGroup: box === undefined ? null : GROUP_OPTIONS[box.kind],
      });
      if (facts === null) return null;
      // A field holds what an observation reads it to hold: a control's value, the option a select, a
      // radio group or a group of checkboxes has chosen — never every option's words, nor a checkbox's
      // bare "on". Only a drawn control, whose value no observation reads, is read by the words it shows.
      if (
        facts.inputType !== null ||
        listed.role === 'radiogroup' ||
        box !== undefined ||
        facts.value !== null
      ) {
        return facts.value;
      }
      return await located.evaluate((el) => el.textContent?.trim() ?? null);
    } catch {
      return null;
    }
  }

  async readChoices(ref: string): Promise<readonly string[] | null> {
    try {
      const listed = this.resolve(ref, 'readChoices');
      return await readTypedChoices(this.locate(listed.ref), this.options.observe.optionWaitMs);
    } catch {
      return null;
    }
  }

  /** The page with the element `outline` names marked while it is taken; one never listed is simply not marked. */
  async screenshot(outline: string | null): Promise<Uint8Array> {
    const listed = outline === null ? undefined : this.known.get(outline);
    return markedScreenshot(this.page, listed === undefined ? null : () => this.locate(listed.ref));
  }

  /**
   * Every page opened since `open` or since the last call, closed newest
   * first; the newest page kept comes to the front. A page the site itself
   * closed has left `context.pages()` and is neither closed nor counted, and
   * the last page open is never closed, whoever opened it: `page` would have
   * nothing left. Closing anything drops the last observation's refs: they
   * belonged to a page that may be gone.
   */
  async closeOpenedPages(): Promise<PagesClosed> {
    if (this.context === null)
      throw new ActionFailed('closeOpenedPages', 'the browser is not open');
    const pages = this.context.pages();
    const opened = pages.filter((page) => !this.kept.has(page));
    const closing = opened.length === pages.length ? opened.slice(1) : opened;
    for (const page of [...closing].reverse()) await page.close();
    this.kept = new Set(this.context.pages());
    if (closing.length > 0) {
      this.known.clear();
      this.fileControls.clear();
      this.choiceBoxes.clear();
      this.tree = [];
    }
    const front = this.page;
    await front.bringToFront();
    return { closed: closing.length, front: front.url() };
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.known.clear();
    this.fileControls.clear();
    this.choiceBoxes.clear();
    this.tree = [];
    this.kept.clear();
    if (context !== null) await context.close();
  }

  /**
   * The ref an action on a listed element is aimed at: its own while the
   * element is still on the page, else the one element a fresh read of the
   * page names with the same role and name — a field the page drew again
   * between the observation and the action. Measured 2026-11-06: a field
   * redrawn while the operator was asked, and one its form's own section
   * redrew, each failed a fill after the whole action timeout. With none, or
   * more than one, the action goes to the listed ref and fails as before.
   */
  private async liveRef(listed: ObservedElement): Promise<string> {
    if (this.fileControls.has(listed.ref) || this.choiceBoxes.has(listed.ref)) return listed.ref;
    if ((await this.page.locator(`aria-ref=${listed.ref}`).count()) > 0) return listed.ref;
    const snapshot = await this.page
      .locator('body')
      .ariaSnapshot({ mode: 'ai', timeout: this.options.observe.snapshotTimeoutMs })
      .catch(() => '');
    const same = decodeAriaSnapshot(snapshot).filter(
      (node) => node.ref !== null && node.role === listed.role && (node.name ?? '') === listed.name,
    );
    const ref = same.length === 1 ? same[0]?.ref : null;
    if (ref === null || ref === undefined) return listed.ref;
    this.known.set(ref, { ...listed, ref });
    return ref;
  }

  /** The element under a ref: a hidden file control by its place among the page's file controls, anything else by the tree's ref. */
  private locate(ref: string): Locator {
    const nth = this.fileControls.get(ref);
    return nth === undefined
      ? this.page.locator(`aria-ref=${ref}`)
      : this.page.locator(FILE_CONTROLS).nth(nth);
  }

  /** The file supplied for a declared document; the session refuses a run that lacks one before any plan, so this never trusts the plan. */
  private documentPath(name: string): string {
    const path = this.documents.get(name);
    if (path === undefined) {
      throw new ActionFailed('upload', `no file was supplied for document ${name}`);
    }
    return path;
  }

  /** The element the last observation listed under the ref, or a refusal: refs never outlive their observation. */
  private resolve(ref: string, label: string): ObservedElement {
    const element = this.known.get(ref);
    if (element === undefined) {
      throw new ActionFailed(label, `${ref} is not an element of the last observation`);
    }
    return element;
  }
}
