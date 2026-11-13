import type { LandmarkRole, PageObservation, StepAction } from '@sysdesign/contracts';

import type { StorageState } from './infra';

/** The plan actions a browser performs; the rest are the engine's own events. */
export const BROWSER_ACTION_KINDS = [
  'navigate',
  'click',
  'fill',
  'select',
  'upload',
  'press',
  'scroll',
  'waitFor',
] as const;
export type BrowserActionKind = (typeof BROWSER_ACTION_KINDS)[number];
export type BrowserAction = Extract<StepAction, { kind: BrowserActionKind }>;

export const isBrowserAction = (action: StepAction): action is BrowserAction =>
  (BROWSER_ACTION_KINDS as readonly string[]).includes(action.kind);

/** An action the page refused: a stale ref, a missing element, a timeout. */
export class ActionFailed extends Error {
  override readonly name = 'ActionFailed';
  constructor(
    readonly action: string,
    detail: string,
  ) {
    super(`${action}: ${detail}`);
  }
}

/** A file the run supplies for a document the mission declares: the name the plan uploads it by, and where the browser reads it from. */
export interface SuppliedDocument {
  name: string;
  path: string;
}

/** What closing a unit's pages did: how many closed, and the URL of the page now in front. */
export interface PagesClosed {
  closed: number;
  front: string;
}

export interface BrowserPort {
  /**
   * The documents are the files an `upload` puts into a file control, by
   * name; the browser alone reads them. A `seed` is a sign-in exported from
   * another machine's profile, set into this one once it is open — it
   * replaces every cookie, local storage and IndexedDB entry the profile
   * holds, so only a fresh profile is ever seeded.
   */
  open(
    profile: string,
    options: { headed: boolean; documents: readonly SuppliedDocument[]; seed?: StorageState },
  ): Promise<void>;
  /**
   * The profile's sign-in state, read from the profile opened on its own,
   * headless, and closed again: what moves it to another machine. The
   * cookies are the profile's whole; the local storage and IndexedDB are
   * those of the `origins` named, each visited on a blank page first.
   */
  exportState(profile: string, origins: readonly string[]): Promise<StorageState>;
  /** The page as it is now; the refs it lists resolve only until the next `observe`. */
  observe(): Promise<PageObservation>;
  /** What the page the last `observe` read states inside one landmark — each node's words in document order, from that observation's tree, never a new read; none when it lays out no such landmark. */
  wordsUnder(landmark: LandmarkRole): readonly string[];
  /** Throws `ActionFailed`. */
  act(action: BrowserAction): Promise<void>;
  /** Mark a field for the operator's eye. */
  highlight(ref: string): Promise<void>;
  /** What the field holds now — what the operator typed into the page — or null when unreadable. */
  readValue(ref: string): Promise<string | null>;
  /**
   * The options a control typed into and chosen from offers with nothing
   * typed: its list opened where a person opens it and read, then closed,
   * the control left as it was; null when it opens no list of its own or the
   * list shows no option.
   */
  readChoices(ref: string): Promise<readonly string[] | null>;
  /**
   * The page as an image, with the element `outline` names marked while it is
   * taken and unmarked after; null marks nothing, and an element that is gone
   * leaves the image unmarked rather than failing it.
   */
  screenshot(outline: string | null): Promise<Uint8Array>;
  /**
   * Close every page opened since `open` or since the last call, newest
   * first, and bring the newest page kept to the front: a unit of work's
   * pages close with it. A page the site itself closed is not counted, and
   * the last page open is never closed, whoever opened it. A call that
   * closed anything invalidates the last observation's refs.
   */
  closeOpenedPages(): Promise<PagesClosed>;
  close(): Promise<void>;
}
