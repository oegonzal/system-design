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
  /**
   * How long, after an action that may open a page (`ActionEffects.opens`),
   * the browser waits for the page it opened to register before the page is
   * read again; a page that registers is read to its document first. Measured
   * 2026-10-30: a job list's card title opened the job page in a new tab 195
   * to 735 ms after the click returned, headless, while the live headed
   * session read the unchanged list 1.1 s after the click, planned a step on
   * it, and observed the tab only on the step after — twice in one unit.
   */
  pageOpenWaitMs: number;
  /**
   * How long a click inside a link that declares it opens a new page — its
   * own `target="_blank"` — waits for that page to register, ending the
   * moment it does. The page's own word, so the wait is long and costs
   * nothing when the page comes at once. Measured 2026-11-05/06: three times
   * in two live headed sessions the job tab a list's title link opened had
   * not registered within `pageOpenWaitMs`, the unchanged list was planned
   * on, and only the next step's plan found the tab — a step lost each time.
   */
  newPageWaitMs: number;
  /** How long the observer waits for the document to settle before each read of the page. */
  settleTimeoutMs: number;
  /**
   * How long one read of the accessibility tree may take: what the page and
   * the frames that answer show by then is the read, and a frame that has
   * not answered is left out of it. Measured 2026-11-06: job pages embedding
   * a dozen to twenty lazy frames that never loaded held every read for the
   * action timeout, 15 s, so an observation's budget was gone before an
   * element was read and the page read as empty (117 of 117, 89 of 89 unread)
   * — with a 2 s bound the same tree, 519 refs, came back in 2 s, and in 0.5 s
   * at 500 ms.
   */
  snapshotTimeoutMs: number;
  /**
   * How long it waits between reads that came back without a ref or that
   * differ from the read before — and between reads of a radio group a select
   * clicked beside, until the group reads as chosen.
   */
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
  /**
   * How long a select waits for the page to show its choice: on a control
   * both typed into and chosen from, for the option whose words it typed to
   * show in the lists the control names; on a radio group whose radio takes
   * no click of its own, for the radio clicked beside it to read as chosen. It
   * ends the moment the choice shows, so only a choice that fails waits it
   * out. Provisional (2026-10-30): a typing debounce plus one lookup, twice
   * over; measured live and resized as `pageOpenWaitMs` was.
   */
  optionWaitMs: number;
}
