import {
  quoted,
  ranActionOf,
  type LastStep,
  type PageObservation,
  type RanAction,
  type StepAction,
  type StepPlan,
  elementByRef,
} from '@sysdesign/contracts';

/**
 * A step's actions in the words the next goal reads them by, and the identity
 * the page would recognise them by again. The history names an element by its
 * role and name, never by a ref the next page will not have; a plan that did
 * not run by its shape alone; and the actions that ran by the identity the
 * contracts give them, so the next plan is briefed by what led to its page.
 */
/** The last step of a plan that ran nothing: refused whole, faulted, or never answered. */
export const NOTHING_RAN: LastStep = { ran: 0, touched: [], held: [] };

/** The session's own close of the pages a unit of work opened, as the next goal reads it: how many, never which. */
export const describeClosedPages = (closed: number): string =>
  `closed ${closed} page(s) the unit opened`;

/** The same close when the browser refused it. */
export const CLOSING_PAGES = 'close the pages the unit opened';

/** The page actions among those that ran, as the page would recognise them again: a wait, a scroll or a unit event has no such identity. */
export const touchedBy = (
  actions: readonly StepAction[],
  elements: PageObservation['elements'],
): RanAction[] =>
  actions.flatMap((action) => {
    const ran = ranActionOf(action, elements);
    return ran === null ? [] : [ran];
  });

/**
 * An element as the next goal names it: by role and name. A ref is minted per
 * observation and names nothing on the next, so a history that carried refs
 * offered the planner tokens it could not cite. Measured 2026-10-08: a plan
 * cited `e114`, a ref from four observations before, and was refused.
 */
const named = (ref: string, observation: PageObservation): string => {
  const element = elementByRef(observation.elements, ref);
  return element === undefined
    ? 'an element no longer listed'
    : `${element.role} ${quoted(element.name)}`;
};

/**
 * A plan that did not run, as one line: how many actions and of what kinds.
 * Never the actions' own words — a refused `terminate limit-reached` rendered
 * whole reads, a step later, as a limit that was reached.
 */
export const describeRefusedPlan = (plan: StepPlan | null): string =>
  plan === null
    ? 'plan'
    : `plan of ${plan.actions.length} action(s): ${plan.actions.map((action) => action.kind).join(', ')}`;

/** One action as the next goal reads it back: its element by role and name, never by a ref the next page will not have. */
export function describeAction(action: StepAction, observation: PageObservation): string {
  switch (action.kind) {
    case 'navigate':
      return `navigate ${action.url}`;
    case 'click':
      return `click ${named(action.ref, observation)}`;
    case 'fill':
      return `fill ${named(action.ref, observation)} with ${quoted(action.value)}`;
    case 'select':
      return `select ${quoted(action.option)} in ${named(action.ref, observation)}`;
    case 'upload':
      return `upload ${quoted(action.document)} into ${named(action.ref, observation)}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}${action.ref === null ? '' : ` to ${named(action.ref, observation)}`}`;
    case 'waitFor':
      return `waitFor ${action.until} ${action.until === 'element' ? named(action.value, observation) : quoted(action.value)}`;
    case 'screenshot':
      return `screenshot ${quoted(action.label)}`;
    case 'askFields':
      return `askFields ${action.refs.map((ref) => named(ref, observation)).join(', ')}`;
    case 'taskStart':
      return `taskStart ${quoted(action.label)}`;
    // A terminal action's detail is a claim about the page. An executed
    // terminate ends the session, so one in the history by construction never
    // ran; rendered with its words it read, a step later, as a limit that was
    // reached. The kind and its cause or outcome are the fact; the words stay
    // in the step's plan.json.
    case 'taskDone':
      return `taskDone ${action.outcome}`;
    case 'terminate':
      return `terminate ${action.cause}`;
    case 'done':
      return 'done';
  }
}
