/**
 * The actions a step plan may take, and what each does to the page and to the
 * plan — one exhaustive table every validator rule derives its lists from, so
 * a new kind declares its effects once and no rule is told about it.
 */
export const STEP_ACTION_KINDS = [
  'navigate',
  'click',
  'fill',
  'select',
  'upload',
  'press',
  'scroll',
  'waitFor',
  'screenshot',
  'askFields',
  'taskStart',
  'taskDone',
  'terminate',
  'done',
] as const;
export type StepActionKind = (typeof STEP_ACTION_KINDS)[number];

/**
 * What each action does to the page and to the plan, as one exhaustive table:
 * whether it touches the element it cites (a touch on a disabled, hidden or
 * unreachable element fails in the browser), what it can do to the page
 * (`replaces` it for certain; `may-change` it; nothing), whether it claims
 * something the page shows, whether it ends the plan, and whether it ends the
 * session. Every list the
 * validators read is derived from here, so a new kind declares its effects
 * once and no rule has to be told about it. A wait is `none` by kind: a wait
 * for a URL or for text is its own declaration that the page will change
 * (`PAGE_REPLACING_WAITS`), and a wait for a listed element is a wait on
 * this page. A `taskDone` claims the page and ends nothing: closing a unit of
 * work is bookkeeping on the session's own ledger, so the next unit's click may
 * follow it in the same plan. A `taskStart` claims the page too: its label and
 * URL are read off the page as observed, so after an action that could change the page it
 * names an item nobody has observed (measured 2026-10-07: a unit opened for one listing with the
 * URL of the listing beside it, clicked in the same plan). Measured 2026-10-05 and 2026-10-06 on
 * two providers: both reached for `taskDone, terminate` as one thought and were
 * refused, three times each, until the failure rail ended the session; and
 * 2026-10-07: a plan that closed an already-applied listing and moved on was
 * refused whole for what followed the close, twice.
 */
export interface ActionEffects {
  readonly touches: boolean;
  /**
   * It needs the element in sight: a click, a fill or a select waits for the
   * element to be visible, so one the page does not show fails in the
   * browser. A file setter does not wait for sight — a file control is
   * routinely hidden behind the page's own styled button — so an upload into
   * a hidden file control is not refused for its sight, while the disabled,
   * dialog and mark rules still hold for it.
   */
  readonly sight: boolean;
  readonly page: 'none' | 'may-change' | 'replaces';
  /** It asserts something the page shows. */
  readonly claims: boolean;
  /** It ends the plan: nothing may follow it. */
  readonly terminal: boolean;
  /**
   * It ends the session — the one action no next observation can check, so a
   * plan carrying one runs only when the loop accepted it.
   */
  readonly endsSession: boolean;
}

/** An action's effects: what it touches and does to the page, and by name the ones few actions have. */
const effects = (
  touches: boolean,
  page: ActionEffects['page'],
  otherEffects: Partial<Pick<ActionEffects, 'claims' | 'terminal' | 'endsSession' | 'sight'>> = {},
): ActionEffects => ({
  touches,
  sight: otherEffects.sight ?? true,
  page,
  claims: otherEffects.claims ?? false,
  terminal: otherEffects.terminal ?? false,
  endsSession: otherEffects.endsSession ?? false,
});

export const ACTION_EFFECTS = {
  navigate: effects(false, 'replaces'),
  click: effects(true, 'may-change'),
  fill: effects(true, 'may-change'),
  select: effects(true, 'may-change'),
  upload: effects(true, 'may-change', { sight: false }),
  press: effects(false, 'may-change'),
  scroll: effects(false, 'none'),
  waitFor: effects(false, 'none'),
  screenshot: effects(false, 'none'),
  askFields: effects(true, 'may-change'),
  taskStart: effects(false, 'none', { claims: true }),
  taskDone: effects(false, 'none', { claims: true }),
  terminate: effects(false, 'none', { claims: true, terminal: true, endsSession: true }),
  done: effects(false, 'none', { terminal: true }),
} as const satisfies Record<StepActionKind, ActionEffects>;

const kindsWhere = (holds: (effect: ActionEffects) => boolean): readonly StepActionKind[] =>
  STEP_ACTION_KINDS.filter((kind) => holds(ACTION_EFFECTS[kind]));

/**
 * Actions that replace the page in front of the session for certain. Anything
 * planned after one would act on, or claim something about, a page nobody has
 * observed yet, so the limits validator cuts a plan there and the page it
 * opens is the next plan's to read. A click or a key press may or may not
 * replace the page, and the critics judge those.
 */
export const PAGE_REPLACING_ACTION_KINDS = kindsWhere((effect) => effect.page === 'replaces');

/**
 * The waits that are themselves a declaration that the page will change: a
 * plan that waits for a URL or for text it cannot see yet is waiting for a
 * page nobody has observed, and whatever it plans after the wait is planned
 * on that page. A wait for a listed element is a wait on this page.
 */
export const PAGE_REPLACING_WAITS = ['url', 'text'] as const;

/** The actions that end a plan; the validators require one of them last and nowhere else. */
export const TERMINAL_ACTION_KINDS = kindsWhere((effect) => effect.terminal);

/**
 * The actions that could leave the page other than it was observed. A
 * `taskDone` or `terminate` is a claim about what the page shows, and it can
 * rest only on the page as observed, so the validators refuse either after
 * any of these in the same plan: the page it would claim something about is
 * the next observation's to show. Measured 2026-10-07: twelve of twenty-two
 * plans closed their unit of work or ended the session on the far side of a
 * navigate, a click or a key press in the same plan — one of them `done`
 * after the Next button of page 1 of 9 of an application form.
 */
export const MUTATING_ACTION_KINDS = kindsWhere((effect) => effect.page !== 'none');

/** The actions that claim something the page shows — a unit opened or closed, a stop reached; `done` claims nothing. */
export const CLAIMING_ACTION_KINDS = kindsWhere((effect) => effect.claims);

export const PRESS_KEYS = [
  'Enter',
  'Tab',
  'Escape',
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Space',
] as const;

export const WAIT_UNTIL = ['element', 'text', 'url'] as const;

export const SCROLL_DIRECTIONS = ['down', 'up'] as const;

/** How a recorded step action went, as the next plan is told. */
export const STEP_OUTCOMES = ['ok', 'failed', 'not-executed'] as const;
