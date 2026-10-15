import {
  ELEMENT_NAME_BOUND,
  ELEMENT_VALUE_BOUND,
  elementKind,
  ELEMENTS_BOUND,
  inScope,
  OPTIONS_BOUND,
  OPTION_BOUND,
  SNAPSHOT_BOUND,
  TITLE_BOUND,
  URL_MAX_LENGTH,
  type ActiveScope,
  type BusyRead,
  type ElementScope,
  type LandmarkRole,
  type ObservationReading,
  type ObservedElement,
  type PageObservation,
  excerpt,
} from '@sysdesign/contracts';

import { fitSnapshot, type FittedSnapshot, type SnapshotNode } from './aria-snapshot';
import { hiddenTraitsOf, type ElementFacts } from './element-facts';

/**
 * One read of the page turned into the observation the contracts describe:
 * each interactive node joined to its DOM facts, its scope and its words; the
 * modal scope in front decided from those facts; the elements ordered so what
 * a person can reach comes first under the cap. Pure of Playwright, so a spec
 * runs it over fixture readings.
 */
const ROLE_MAX = 40;
const INPUT_TYPE_MAX = 30;
/** The roles a person picks: one may be named after the question it answers, and read as the answer. */
const CHOICE_ROLES: ReadonlySet<string> = new Set(['radio', 'checkbox']);

/** One read of the page, and what it could not reach. */
export interface PageReading {
  url: string;
  title: string;
  snapshot: string;
  /** The tree the snapshot decodes to, in document order: what the browser answers `wordsUnder` from until the next read. */
  nodes: readonly SnapshotNode[];
  elements: ObservedElement[];
  unreadElements: number;
  unreadSnapshotLines: number;
  /** The scope of the node the page marks active, when it marks one inside a scope. */
  focusedScope: ActiveScope | null;
  /** The landmarks the tree lays the page out in, each once. */
  landmarks: readonly LandmarkRole[];
  /**
   * Whether a dialog in front of the page says it is still loading, as ARIA
   * says it: busy, or showing a progressbar with no current value — an
   * indeterminate one. A read of such a dialog is never settled. Measured
   * 2026-10-10: two reads 1.2 s apart agreed on a dialog holding only its
   * close button, a heading and such a progressbar; the form it was loading
   * rendered a moment later, and the plan made on the shell spent a step
   * waiting for it — twice in one session.
   */
  scopeBusy: boolean;
  /** What that check saw, candidate by candidate, so a dump can say why it held or did not. */
  busyRead: BusyRead;
}

/**
 * Whether the tree has a `main` landmark that no element sits in yet: the
 * page's content has not rendered, however settled the chrome around it
 * reads. Measured 2026-10-08: three observations of a results page agreed
 * twice over, 33 elements of banner, navigation and search box, and a `main`
 * with nothing beneath it; each plan made on them was wasted.
 */
export const mainUnrendered = (reading: PageReading): boolean =>
  reading.landmarks.includes('main') &&
  !reading.elements.some((element) => element.landmark === 'main');

/**
 * Whether a read failed wholesale rather than finding little. Both halves are
 * facts about the read, never a guess about the page: every ref dead means the
 * snapshot's map is stale, and no node from a snapshot with lines in it means
 * the text was not read.
 */
export const failedWholesale = (reading: PageReading): boolean =>
  reading.unreadSnapshotLines > 0 || (reading.unreadElements > 0 && reading.elements.length === 0);
/**
 * An element's name is the tree's — or, for an element the tree gives none,
 * the `name` or `id` attribute, which is what names a honeypot. What a person
 * reads on such an element is kept apart, as `text`: the words beneath it in
 * the tree, else what the DOM renders inside it. An element the tree named
 * carries no text of its own — except a choice whose name is not what it
 * reads: a radio named after its question keeps the "Yes" a person reads on it,
 * so two answers named alike can still be told apart.
 */
export function toObservedElement(
  node: SnapshotNode,
  facts: ElementFacts,
  scope: ActiveScope | null,
  words: string,
  landmark: LandmarkRole | null = null,
): ObservedElement {
  const unnamed = node.name === null || node.name === '';
  const name = excerpt(node.name ?? facts.nameHint ?? '', ELEMENT_NAME_BOUND.target);
  const reads = unnamed
    ? words || facts.text
    : CHOICE_ROLES.has(node.role) && facts.text !== node.name
      ? facts.text
      : '';
  const text = excerpt(reads, ELEMENT_NAME_BOUND.target);
  return {
    ref: node.ref ?? '',
    role: excerpt(node.role, ROLE_MAX),
    name,
    text: text === '' ? null : text,
    kind: elementKind(node.role, facts),
    inputType: facts.inputType === null ? null : excerpt(facts.inputType, INPUT_TYPE_MAX),
    value: facts.value === null ? null : excerpt(facts.value, ELEMENT_VALUE_BOUND.target),
    options:
      facts.options === null
        ? null
        : facts.options
            .slice(0, OPTIONS_BOUND.target)
            .map((option) => excerpt(option, OPTION_BOUND.target)),
    optionsOmitted:
      facts.options === null ? 0 : Math.max(0, facts.options.length - OPTIONS_BOUND.target),
    required: facts.required,
    invalid: facts.invalid,
    disabled: facts.disabled || node.attributes['disabled'] === true,
    visible: facts.visible,
    maxLength: facts.maxLength,
    hiddenTraits: hiddenTraitsOf(facts),
    context: facts.context === null ? null : excerpt(facts.context, ELEMENT_NAME_BOUND.target),
    scope:
      scope === null
        ? null
        : {
            role: scope.role,
            name: excerpt(scope.name, ELEMENT_NAME_BOUND.target),
            modal: facts.modal,
          },
    landmark,
  };
}

const sameScope = (a: ElementScope, b: ActiveScope): boolean =>
  a.role === b.role && a.name === b.name;

/**
 * The modal dialog in front: the one holding the node the page marks active,
 * when that node sits in a modal scope; else the last modal scope any element
 * reports, in document order. Null when no element sits in a modal dialog.
 */
function activeScopeOf(reading: PageReading): ActiveScope | null {
  const modal = reading.elements.flatMap((element) =>
    element.scope !== null && element.scope.modal ? [element.scope] : [],
  );
  const focused =
    reading.focusedScope === null
      ? undefined
      : modal.find((scope) => sameScope(scope, reading.focusedScope as ActiveScope));
  const chosen = focused ?? modal[modal.length - 1];
  return chosen === undefined ? null : { role: chosen.role, name: chosen.name };
}

/**
 * The scope a snapshot keeps whole when it has to be cut: the modal dialog in
 * front, else the last dialog an element sits in, modal or not. A dialog that
 * does not block the page never becomes the active scope — the elements
 * behind it stay in reach — but it is what the page is saying now. Measured
 * 2026-10-10: the dialog confirming an application was sent carried no
 * aria-modal, sat last in a 696-line snapshot, and was the part the goal's cut
 * dropped, so planner and judges read the outcome from the pane alone.
 */
export function snapshotScopeOf(
  activeScope: ActiveScope | null,
  elements: readonly ObservedElement[],
): ActiveScope | null {
  if (activeScope !== null) return activeScope;
  const dialogs = elements.flatMap((element) =>
    element.scope === null ? [] : [{ role: element.scope.role, name: element.scope.name }],
  );
  return dialogs[dialogs.length - 1] ?? null;
}

/**
 * Inside the open scope first, then what is visible and enabled in the main
 * landmark, then the rest of what is visible and enabled, then everything
 * else, each in document order — so under the cap the page's content comes
 * before its chrome.
 */
function ordered(
  elements: readonly ObservedElement[],
  activeScope: ActiveScope | null,
): ObservedElement[] {
  const reachable = (element: ObservedElement): boolean => element.visible && !element.disabled;
  // With no dialog open nothing is "inside the open scope": the page's own order holds.
  const inOpenScope = (element: ObservedElement): boolean =>
    activeScope !== null && inScope(element, activeScope);
  const inMain = (element: ObservedElement): boolean => element.landmark === 'main';
  return [
    ...elements.filter((element) => reachable(element) && inOpenScope(element)),
    ...elements.filter((element) => reachable(element) && !inOpenScope(element) && inMain(element)),
    ...elements.filter(
      (element) => reachable(element) && !inOpenScope(element) && !inMain(element),
    ),
    ...elements.filter((element) => !reachable(element)),
  ];
}

/** The reading as the contracts see it: what the fingerprint compares, and what `observe` reports. */
export function toObservation(reading: PageReading, read: ObservationReading): PageObservation {
  const activeScope = activeScopeOf(reading);
  const all = ordered(reading.elements, activeScope);
  const listed = all.slice(0, ELEMENTS_BOUND.target);
  const nothingUnread = reading.unreadElements === 0 && reading.unreadSnapshotLines === 0;
  return {
    url: excerpt(reading.url, URL_MAX_LENGTH),
    title: excerpt(reading.title, TITLE_BOUND.target),
    elements: listed,
    omittedElements: all.length - listed.length,
    unread: nothingUnread
      ? null
      : { elements: reading.unreadElements, snapshotLines: reading.unreadSnapshotLines },
    activeScope,
    // Reduced only where it would not fit what an observation may carry, an
    // open dialog kept whole; the goal composer fits it again to the room the
    // goal actually has.
    ...snapshotAt(
      fitSnapshot(
        reading.snapshot,
        SNAPSHOT_BOUND.target,
        snapshotScopeOf(activeScope, reading.elements),
      ),
    ),
    reading: read,
  };
}

/** The two fields a fitted snapshot fills on an observation. */
const snapshotAt = (
  fitted: FittedSnapshot,
): Pick<PageObservation, 'ariaSnapshot' | 'snapshotRung'> => ({
  ariaSnapshot: fitted.text,
  snapshotRung: fitted.rung,
});
