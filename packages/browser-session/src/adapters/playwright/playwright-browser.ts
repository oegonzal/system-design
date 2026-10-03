import { join } from 'node:path';

import {
  actionRefs,
  ELEMENT_NAME_MAX,
  ELEMENT_VALUE_MAX,
  elementKindOf,
  MAX_ELEMENTS,
  MAX_OPTIONS,
  OPTION_MAX,
  pageObservationSchema,
  SNAPSHOT_MAX_BYTES,
  TITLE_MAX,
  URL_MAX,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';

import { ActionFailed, type BrowserAction, type BrowserPort } from '../../core/ports';
import { clip } from '../../core/text';
import { decodeAriaSnapshot, fitSnapshot, type SnapshotNode } from './aria-snapshot';
import { hiddenTraitsOf, readElementFacts, type ElementFacts } from './element-facts';

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
}

export const CHROME_CHANNEL = 'chrome';
export const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
const SCROLL_PX = 600;
const ROLE_MAX = 40;
const INPUT_TYPE_MAX = 30;

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);

function toObservedElement(node: SnapshotNode, facts: ElementFacts): ObservedElement {
  return {
    ref: node.ref ?? '',
    role: clip(node.role, ROLE_MAX),
    name: clip(node.name ?? facts.nameHint ?? '', ELEMENT_NAME_MAX),
    kind: elementKindOf(node.role),
    inputType: facts.inputType === null ? null : clip(facts.inputType, INPUT_TYPE_MAX),
    value: facts.value === null ? null : clip(facts.value, ELEMENT_VALUE_MAX),
    options:
      facts.options === null
        ? null
        : facts.options.slice(0, MAX_OPTIONS).map((option) => clip(option, OPTION_MAX)),
    required: facts.required,
    disabled: facts.disabled || node.attributes['disabled'] === true,
    visible: facts.visible,
    maxLength: facts.maxLength,
    hiddenTraits: hiddenTraitsOf(facts),
    context: facts.context === null ? null : clip(facts.context, ELEMENT_NAME_MAX),
  };
}

/** Visible, enabled elements first, then the rest, each half in document order. */
const ordered = (elements: readonly ObservedElement[]): ObservedElement[] => [
  ...elements.filter((element) => element.visible && !element.disabled),
  ...elements.filter((element) => !(element.visible && !element.disabled)),
];

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

  async observe(): Promise<PageObservation> {
    const page = this.page;
    const snapshot = await page.locator('body').ariaSnapshot({ mode: 'ai' });
    const nodes = decodeAriaSnapshot(snapshot).filter(
      (node) => node.ref !== null && elementKindOf(node.role) !== 'static',
    );
    const elements: ObservedElement[] = [];
    for (const node of nodes) {
      const facts = await readElementFacts(page.locator(`aria-ref=${node.ref}`));
      if (facts !== null) elements.push(toObservedElement(node, facts));
    }
    const all = ordered(elements);
    const listed = all.slice(0, MAX_ELEMENTS);
    this.known = new Map(listed.map((element) => [element.ref, element]));
    return pageObservationSchema.parse({
      url: clip(page.url(), URL_MAX),
      title: clip(await page.title(), TITLE_MAX),
      elements: listed,
      omittedElements: all.length - listed.length,
      ariaSnapshot: fitSnapshot(snapshot, SNAPSHOT_MAX_BYTES).text,
    });
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
