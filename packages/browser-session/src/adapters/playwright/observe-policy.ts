/**
 * How the browser adapter waits on and reads a page — declared in the
 * session's `observe` settings, never in code, because every figure here was
 * sized against live pages and the next site may need another. What each
 * field means, and what it was measured against, is said here; its value
 * lives only in the file.
 */
export interface ObservePolicy {
  /** The default timeout of every Playwright action the session takes. */
  actionTimeoutMs: number;
  /** How long the observer waits for the document to settle before each read of the page. */
  settleTimeoutMs: number;
  /** How long it waits between reads that came back without a ref or that differ from the read before. */
  settleRetryMs: number;
  /**
   * How many times a ref-less read is taken again before the page is reported
   * as it stands. Measured live on 2026-10-03: a read taken while a key press
   * was navigating returned a 450-line snapshot carrying no refs, and the
   * session told the brain a full page had no interactive elements.
   */
  emptySnapshotReads: number;
  /**
   * The timeout on a single element's facts read: one DOM evaluate on an
   * element Playwright already located answers in about a millisecond.
   */
  factsTimeoutMs: number;
  /**
   * The budget for every facts read of every read one observation takes — one
   * deadline for the whole observation, not one per read, because reads are
   * taken until two agree. Measured live on 2026-10-03: unbounded, a stalled
   * renderer held one observation eighteen minutes past the session's rail,
   * which the engine checks only between phases.
   */
  observeBudgetMs: number;
  /**
   * How many times the page is read when a read fails wholesale — every ref
   * the snapshot handed out came back dead, or the grammar read no node from a
   * snapshot with lines in it. Measured live on 2026-10-03: 135 elements seen,
   * 135 reads dead.
   */
  wholesaleReads: number;
  /**
   * How many further reads a page that keeps changing is given before it is
   * reported as it stands; a page is reported once two reads in a row agree.
   * Measured live on 2026-10-07: a page read a second after its own reload,
   * before its main control rendered, was reported without it thirteen steps
   * in a row.
   */
  stableReads: number;
  /** How far one page-level scroll moves, in CSS pixels. */
  scrollPx: number;
}
