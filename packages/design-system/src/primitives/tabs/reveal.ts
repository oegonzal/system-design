/** Where a tab sits along its row, in the scroller's own coordinates. */
export interface RowSpan {
  start: number;
  end: number;
}

/**
 * What the scroller shows right now: where it is scrolled to, how wide it
 * is, and how wide the row inside it is.
 */
export interface RowView {
  scrollLeft: number;
  width: number;
  contentWidth: number;
}

/** Which ends of a row hold tabs that are out of view. */
export interface HiddenEnds {
  start: boolean;
  end: boolean;
}

export const NONE_HIDDEN: HiddenEnds = { start: false, end: false };

/**
 * A scroll position is fractional on a scaled display while the widths
 * around it are whole pixels: a row within a pixel of an end is at that end.
 */
const AT_END_SLACK = 1;

/** The furthest a view scrolls: the row's far end against the view's. */
const maxScrollLeft = (view: RowView): number => Math.max(0, view.contentWidth - view.width);

const clamp = (scrollLeft: number, view: RowView): number =>
  Math.min(Math.max(0, scrollLeft), maxScrollLeft(view));

/**
 * Which ends of the row run past the view by more than `sliver` — where an
 * edge affordance belongs. An end that hides no more than that is treated as
 * the row's end: the fade and arrow would cover more of the row than the
 * overflow they announce. Never closer than a pixel, for the sub-pixel scroll.
 */
export function hiddenEnds(view: RowView, sliver = 0): HiddenEnds {
  const slack = Math.max(AT_END_SLACK, sliver);
  return {
    start: view.scrollLeft > slack,
    end: view.scrollLeft < maxScrollLeft(view) - slack,
  };
}

/**
 * The `scrollLeft` that brings `span` into `view`, moving it as little as it
 * can: a span already in view stays put, one off the start is aligned to
 * the start, and one off the end to the end. "In view" is clear of `inset`
 * at each end — the width an edge affordance covers while that end holds
 * more — so a revealed span is never left under one; at the row's own ends
 * there is no affordance and the span sits flush. Pure, so the rule is
 * testable without a layout engine.
 */
export function revealScrollLeft(span: RowSpan, view: RowView, inset = 0): number {
  if (span.start - inset < view.scrollLeft) return clamp(span.start - inset, view);
  if (span.end + inset > view.scrollLeft + view.width)
    return clamp(span.end + inset - view.width, view);
  return view.scrollLeft;
}

/**
 * The `scrollLeft` one press of an edge affordance moves to: a view's width
 * toward that end, less what the affordances cover, so the tab cut off at
 * the edge is whole on the next page rather than skipped. A page that would
 * stop within an affordance's width of the row's end goes to the end — a
 * sliver left over is not worth a press of its own.
 */
export function pageScrollLeft(view: RowView, toward: keyof HiddenEnds, inset = 0): number {
  const page = Math.max(0, view.width - 2 * inset);
  const furthest = maxScrollLeft(view);
  const target = view.scrollLeft + (toward === 'end' ? page : -page);
  if (target <= inset) return 0;
  if (target >= furthest - inset) return furthest;
  return target;
}
