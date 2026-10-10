/**
 * The inspect route's query vocabulary, in one place.
 *
 * A link into the inspector has to survive a reload and a paste into a
 * colleague's window, so what it points at lives in the URL and nowhere else.
 * `parseInspectTarget` and `inspectHref` are exact inverses over a normalised
 * target: every absent, empty or blank value is `null`, so two spellings of
 * "nothing selected" cannot produce two different links.
 *
 * This module is pure on purpose. It reads a `get` and returns a string, which
 * is all `URLSearchParams` and Next's `ReadonlyURLSearchParams` have in common,
 * so the vocabulary is specced without a router and without a DOM.
 */

export const INSPECT_ROUTE = '/inspect';

/** What the inspector is pointed at. Every field independent, every absence `null`. */
export interface InspectTarget {
  /** The quality run whose loop is being read. */
  run: string | null;
  /** The orchestration run whose steps are being read. */
  orchestration: string | null;
  /** The key of the selected action, so a shared link reopens the same moment. */
  action: string | null;
  /**
   * Only what one caller opened, by the id it gave (`RunOpenerDto.id`). A filter
   * on the lists rather than a selection: it points the inspector at nothing.
   */
  openedBy: string | null;
}

/** The least a query-string reader has to offer. `URLSearchParams` satisfies it. */
export interface QueryReader {
  get(name: string): string | null;
}

export const EMPTY_TARGET: InspectTarget = {
  run: null,
  orchestration: null,
  action: null,
  openedBy: null,
};

/**
 * The parameter names, in the order an href writes them. Declared once as
 * data: the parser reads these keys and the writer writes them, so a renamed
 * parameter cannot be renamed on one side only.
 */
const PARAMS = ['run', 'orchestration', 'action', 'openedBy'] as const;

/** A value worth carrying, or `null`. Whitespace is not a selection. */
const cleaned = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** The target a query string names, with every absence spelled one way. */
export function parseInspectTarget(params: QueryReader | null | undefined): InspectTarget {
  if (!params) return EMPTY_TARGET;
  return {
    run: cleaned(params.get('run')),
    orchestration: cleaned(params.get('orchestration')),
    action: cleaned(params.get('action')),
    openedBy: cleaned(params.get('openedBy')),
  };
}

/** The same target with every field normalised — what an href round-trips to. */
export const normaliseTarget = (target: Partial<InspectTarget>): InspectTarget => ({
  run: cleaned(target.run),
  orchestration: cleaned(target.orchestration),
  action: cleaned(target.action),
  openedBy: cleaned(target.openedBy),
});

/** Whether the inspector has anything to show. */
export const hasTarget = (target: InspectTarget): boolean =>
  target.run !== null || target.orchestration !== null;

/**
 * The link to a target: the route alone when nothing is selected, otherwise the
 * route plus the named parameters in declaration order. A function of the
 * normalised target only, so the same selection always produces the same link.
 */
export function inspectHref(target: Partial<InspectTarget>): string {
  const normalised = normaliseTarget(target);
  const query = new URLSearchParams();
  for (const name of PARAMS) {
    const value = normalised[name];
    if (value !== null) query.set(name, value);
  }
  const search = query.toString();
  return search === '' ? INSPECT_ROUTE : `${INSPECT_ROUTE}?${search}`;
}

/** The query half of an href, for a router that replaces the search in place. */
export const inspectSearch = (target: Partial<InspectTarget>): string =>
  inspectHref(target).slice(INSPECT_ROUTE.length);

/** Whether two targets point at the same thing — used to avoid replacing a URL with itself. */
export const sameTarget = (a: InspectTarget, b: InspectTarget): boolean =>
  PARAMS.every((name) => a[name] === b[name]);
