/** Where a tab sits along its row, in the scroller's own coordinates. */
export interface RowSpan {
  start: number;
  end: number;
}

/** What the scroller shows right now: where it is scrolled to, and how wide it is. */
export interface RowView {
  scrollLeft: number;
  width: number;
}

/**
 * The `scrollLeft` that brings `span` into `view`, moving it as little as it
 * can: a span already in view stays put, one off the start is aligned to
 * the start, and one off the end to the end. Pure, so the rule is testable
 * without a layout engine.
 */
export function revealScrollLeft(span: RowSpan, view: RowView): number {
  if (span.start < view.scrollLeft) return span.start;
  if (span.end > view.scrollLeft + view.width) return span.end - view.width;
  return view.scrollLeft;
}
