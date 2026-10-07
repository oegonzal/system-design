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
  type ElementScope,
  type ObservationReading,
  type ObservedElement,
  type PageObservation,
} from '@sysdesign/contracts';

import { clip } from '../../core/text';
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

/** One read of the page, and what it could not reach. */
export interface PageReading {
  url: string;
  title: string;
  snapshot: string;
  elements: ObservedElement[];
  unreadElements: number;
  unreadSnapshotLines: number;
  /** The scope of the node the page marks active, when it marks one inside a scope. */
  focusedScope: ActiveScope | null;
}

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
 * carries no text of its own.
 */
export function toObservedElement(
  node: SnapshotNode,
  facts: ElementFacts,
  scope: ActiveScope | null,
  words: string,
): ObservedElement {
  const unnamed = node.name === null || node.name === '';
  const name = clip(node.name ?? facts.nameHint ?? '', ELEMENT_NAME_BOUND.target);
  const text = unnamed ? clip(words || facts.text, ELEMENT_NAME_BOUND.target) : '';
  return {
    ref: node.ref ?? '',
    role: clip(node.role, ROLE_MAX),
    name,
    text: text === '' ? null : text,
    kind: elementKind(node.role, facts),
    inputType: facts.inputType === null ? null : clip(facts.inputType, INPUT_TYPE_MAX),
    value: facts.value === null ? null : clip(facts.value, ELEMENT_VALUE_BOUND.target),
    options:
      facts.options === null
        ? null
        : facts.options
            .slice(0, OPTIONS_BOUND.target)
            .map((option) => clip(option, OPTION_BOUND.target)),
    required: facts.required,
    disabled: facts.disabled || node.attributes['disabled'] === true,
    visible: facts.visible,
    maxLength: facts.maxLength,
    hiddenTraits: hiddenTraitsOf(facts),
    context: facts.context === null ? null : clip(facts.context, ELEMENT_NAME_BOUND.target),
    scope:
      scope === null
        ? null
        : {
            role: scope.role,
            name: clip(scope.name, ELEMENT_NAME_BOUND.target),
            modal: facts.modal,
          },
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

/** Inside the open scope first, then the rest of what is visible and enabled, then everything else, each in document order. */
function ordered(
  elements: readonly ObservedElement[],
  activeScope: ActiveScope | null,
): ObservedElement[] {
  const reachable = (element: ObservedElement): boolean => element.visible && !element.disabled;
  return [
    ...elements.filter((element) => reachable(element) && inScope(element, activeScope)),
    ...elements.filter((element) => reachable(element) && !inScope(element, activeScope)),
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
    url: clip(reading.url, URL_MAX_LENGTH),
    title: clip(reading.title, TITLE_BOUND.target),
    elements: listed,
    omittedElements: all.length - listed.length,
    unread: nothingUnread
      ? null
      : { elements: reading.unreadElements, snapshotLines: reading.unreadSnapshotLines },
    activeScope,
    // Reduced only where it would not fit what an observation may carry, the
    // open scope kept whole; the goal composer fits it again to the room the
    // goal actually has.
    ...snapshotAt(fitSnapshot(reading.snapshot, SNAPSHOT_BOUND.target, activeScope)),
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
