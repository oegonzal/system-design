/**
 * The exact checks on a step plan: what the page's index says against what
 * the plan does. A plan that acts on an element the page never offered,
 * touches a disabled one before anything could have enabled it, one the page
 * hides, one that is not visible or one behind the open dialog, goes on past
 * an action that replaces the page, or claims what the page shows after an
 * action that could have changed it, is refused from that action on — and
 * the hidden-element case is critical on its own, since it is the DOM half
 * of "a trap is left blank".
 *
 * Both validators CUT rather than block: a plan's actions run in order, so a
 * fault at action.3 says nothing against action.1 and action.2, which were
 * planned against the page the session has. The lenses still judge the whole
 * plan with these problems already counted, and the session runs it up to the
 * first fault. Measured on 2026-10-07: six plans in a row whose first action
 * would have moved the session off an empty document were voided whole for a
 * ref at action.2 or action.3, and the session never left that document.
 *
 * Nothing here reads prose: every fact is in the index the session wrote.
 */
import {
  ACTION_EFFECTS,
  actionLocation,
  actionRefs,
  CLAIMING_ACTION_KINDS,
  MUTATING_ACTION_KINDS,
  PAGE_REPLACING_ACTION_KINDS,
  PAGE_REPLACING_WAITS,
  TERMINAL_ACTION_KINDS,
  TERMINAL_FOLLOWERS,
  type Severity,
  type StepAction,
  type StepIndex,
  type StepPlan,
  type ValidationProblem,
} from '@sysdesign/contracts';

import {
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  problem,
  REFERENCES_VALIDATOR_ID,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { BROWSER_STEP_PIPELINE_ID, readIndex } from './input';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<StepPlan, StepIndex>;
type Element = StepIndex['elements'][number];
type Fault = { severity: Severity; message: string };

const quote = (text: string): string => JSON.stringify(text);

/** Every ref an action cites is one the page listed; located at the action, so the caller stops before it. */
const references: Rule = (plan, index) => {
  const known = new Set(index.elements.map((element) => element.ref));
  return plan.actions.flatMap((action, position) =>
    actionRefs(action)
      .filter((ref) => !known.has(ref))
      .map((ref) =>
        problem('critical', `${ref} is not a listed element`, [actionLocation(position)]),
      ),
  );
};

const isTerminal = (action: StepAction): boolean =>
  (TERMINAL_ACTION_KINDS as readonly string[]).includes(action.kind);
const mutates = (action: StepAction): boolean =>
  (MUTATING_ACTION_KINDS as readonly string[]).includes(action.kind);
const claims = (action: StepAction): boolean =>
  (CLAIMING_ACTION_KINDS as readonly string[]).includes(action.kind);

/**
 * Whether an action replaces the page: by its kind, or — for a wait — by what
 * it waits for. Measured 2026-10-07: a plan filled the search box, pressed
 * Enter, waited for text on the results page, then closed its unit of work and
 * terminated — three claims about a page it had not seen; the wait's own
 * `until` had already said the page would change.
 */
const replacesPage = (action: StepAction): boolean =>
  (PAGE_REPLACING_ACTION_KINDS as readonly string[]).includes(action.kind) ||
  (action.kind === 'waitFor' && (PAGE_REPLACING_WAITS as readonly string[]).includes(action.until));

/**
 * Whether what follows a terminal action is allowed to: the declared pairing,
 * and exactly one action, since that one is itself terminal and so must be
 * last. Everything else after a terminal action is a touch on a page this plan
 * cannot have observed.
 */
function endingIsAllowed(action: StepAction, rest: readonly StepAction[]): boolean {
  const followers = TERMINAL_FOLLOWERS[action.kind] ?? [];
  const only = rest.length === 1 ? rest[0] : undefined;
  return only !== undefined && followers.includes(only.kind);
}

/**
 * Whether an action touches the element it cites, from the declared effects:
 * a touch on a disabled element fails in the browser; waiting for one or
 * scrolling it into view does not, and a plan that waits for a Submit
 * control to become enabled is the ordinary shape of a wizard page.
 */
const touches = (action: StepAction): boolean => ACTION_EFFECTS[action.kind].touches;

/** Whether the element's disabled state at observation still binds this action. */
interface Standing {
  /** An earlier action in the plan answers fields, so a control disabled until they are filled may be enabled by now. */
  afterFields: boolean;
}

/** What one action may not do to the elements it cites; an unlisted ref is the references rule's to report. */
function elementFaults(
  action: StepAction,
  elements: ReadonlyMap<string, Element>,
  standing: Standing,
): Fault[] {
  const faults: Fault[] = [];
  const fault = (severity: Severity, message: string): void => {
    faults.push({ severity, message });
  };
  for (const ref of actionRefs(action)) {
    const element = elements.get(ref);
    if (element === undefined) continue;
    if (element.disabled && touches(action) && !standing.afterFields) {
      fault('high', `${ref} is disabled`);
    }
    // What a person could not reach: behind the open dialog, or not shown at
    // all. Measured 2026-10-07: a form page listed 150 elements with the
    // open dialog's five fields among them unmarked, and the plans touched
    // the page behind it.
    if (touches(action) && element.behind) {
      fault('high', `${ref} is behind the open dialog: a person could not reach it`);
    }
    if (touches(action) && !element.visible && element.hiddenTraits.length === 0) {
      fault('high', `${ref} is not visible`);
    }
    if (
      (action.kind === 'fill' || action.kind === 'select' || action.kind === 'click') &&
      element.hiddenTraits.length > 0
    ) {
      fault(
        'critical',
        `${ref} is hidden (${element.hiddenTraits.join(', ')}); an element the page hides is never touched`,
      );
    }
    if (action.kind === 'fill' && element.kind !== 'fillable') {
      fault('high', `${ref} cannot be typed into (${element.kind})`);
    }
    if (action.kind === 'select') {
      if (element.kind !== 'selectable') {
        fault('high', `${ref} offers nothing to select (${element.kind})`);
      } else if (element.options !== null && !element.options.includes(action.option)) {
        fault('high', `${quote(action.option)} is not an option of ${ref}`);
      }
    }
    if (
      action.kind === 'askFields' &&
      element.kind !== 'fillable' &&
      element.kind !== 'selectable'
    ) {
      fault('high', `${ref} is not a field to answer (${element.kind})`);
    }
  }
  return faults;
}

/**
 * Actions that assert something the page shows: a terminate names a stop
 * condition on it, a taskDone an outcome on it. On a page that shows nothing
 * the assertion has nothing to rest on. Measured 2026-10-07: twelve plans in a
 * row terminated an empty document for a limit it could not show, each one
 * resting on the previous plan's words, and only a credulous evaluator sample
 * stood between the session and ending as a success with no work done.
 */
const claimFault = (action: StepAction, pageShowsContent: boolean): Fault | null =>
  !pageShowsContent && claims(action)
    ? {
        severity: 'high',
        message: `${action.kind} on a page that shows nothing: no stop condition or outcome is shown to rest it on — wait for, or navigate to, the page the mission names`,
      }
    : null;

/**
 * A claim rests on the page as observed, so one that follows an action that
 * could have changed the page rests on nothing this plan has seen. The page
 * such an action leads to is the next observation's to show. Measured
 * 2026-10-07: `askFields, click Next, taskDone done` on page 1 of 9 of an
 * application form — with the task rule that voided it gone, that plan would
 * have run whole and closed the session's one unit of work as done.
 */
const staleClaimFault = (action: StepAction, mutated: Earlier | null): Fault | null =>
  mutated !== null && claims(action)
    ? {
        severity: 'high',
        message: `${action.kind} follows the ${mutated.kind} at ${actionLocation(mutated.position)}: it claims what the page shows, and that page has not been observed`,
      }
    : null;

/** An action earlier in the plan that the one being checked is held against. */
type Earlier = { position: number; kind: StepAction['kind'] };

const limits: Rule = (plan, index) => {
  const elements = new Map(index.elements.map((element) => [element.ref, element]));
  const problems: ValidationProblem[] = [];
  // Located at the first action past the limit, so the plan is cut there and
  // the actions within the limit still run: a limit never discards work.
  if (plan.actions.length > index.maxActions) {
    problems.push(
      problem('high', `${plan.actions.length} actions planned; the limit is ${index.maxActions}`, [
        actionLocation(index.maxActions),
      ]),
    );
  }
  let afterFields = false;
  /** The first action that replaced the page, once one has. */
  let replaced: Earlier | null = null;
  /** The first action that could have changed the page, once one has. */
  let mutated: Earlier | null = null;
  plan.actions.forEach((action, position) => {
    const at = [actionLocation(position)];
    // The Limits section says it and this is where it is enforced: an action
    // after one that replaces the page acts on a page nobody has observed.
    if (replaced !== null) {
      problems.push(
        problem(
          'high',
          `${action.kind} follows the ${replaced.kind} at ${actionLocation(replaced.position)}: the page it would act on has not been observed`,
          at,
        ),
      );
    } else if (replacesPage(action)) {
      replaced = { position, kind: action.kind };
    }
    if (isTerminal(action) && position !== plan.actions.length - 1) {
      const rest = plan.actions.slice(position + 1);
      if (!endingIsAllowed(action, rest)) {
        const followers = TERMINAL_FOLLOWERS[action.kind] ?? [];
        problems.push(
          problem(
            'high',
            followers.length === 0
              ? `${action.kind} must be the last action`
              : `${action.kind} must be the last action, or the one before ${followers.join(' or ')}`,
            at,
          ),
        );
      }
    }
    const claim = claimFault(action, index.pageShowsContent);
    if (claim !== null) problems.push(problem(claim.severity, claim.message, at));
    // Past a page replacement every action is already refused above; the
    // stale-claim rule says what a replacement rule did not.
    const stale = replaced === null ? staleClaimFault(action, mutated) : null;
    if (stale !== null) problems.push(problem(stale.severity, stale.message, at));
    for (const fault of elementFaults(action, elements, { afterFields })) {
      problems.push(problem(fault.severity, fault.message, at));
    }
    if (action.kind === 'askFields') afterFields = true;
    if (mutated === null && mutates(action)) mutated = { position, kind: action.kind };
  });
  return problems;
};

export const referencesValidator: Validator<StepPlan> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${BROWSER_STEP_PIPELINE_ID} index`)],
  'cut',
);

export const limitsValidator: Validator<StepPlan> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
  'cut',
);
