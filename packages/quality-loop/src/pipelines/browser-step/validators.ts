/**
 * The exact checks on a step plan: what the page's index says against what
 * the plan does. A plan that acts on an element the page never offered,
 * touches a disabled one before anything could have enabled it, or touches
 * an element the page hides cannot be trusted by any lens, so both validators
 * block — and the hidden-element case is critical on its own, since it is
 * the DOM half of "a trap is left blank". Nothing here reads prose: every
 * fact is in the index the session wrote.
 */
import {
  actionLocation,
  actionRefs,
  TERMINAL_ACTION_KINDS,
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

/**
 * Which actions touch the element they cite, as data. A touch on a disabled
 * element fails in the browser; waiting for one or scrolling it into view
 * does not, and a plan that waits for a Submit control to become enabled is
 * the ordinary shape of a wizard page.
 */
const TOUCHES: Readonly<Record<StepAction['kind'], boolean>> = {
  navigate: false,
  click: true,
  fill: true,
  select: true,
  press: false,
  scroll: false,
  waitFor: false,
  screenshot: false,
  askFields: true,
  taskStart: false,
  taskDone: false,
  terminate: false,
  done: false,
};

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
    if (element.disabled && TOUCHES[action.kind] && !standing.afterFields) {
      fault('high', `${ref} is disabled`);
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

/** A unit of work opens once and closes once; the plan may do either only where the ledger allows it. */
const taskFault = (action: StepAction, open: boolean): Fault | null => {
  if (action.kind === 'taskStart' && open) {
    return { severity: 'high', message: 'taskStart while a unit of work is already open' };
  }
  if (action.kind === 'taskDone' && !open) {
    return { severity: 'high', message: 'taskDone while no unit of work is open' };
  }
  return null;
};

const limits: Rule = (plan, index) => {
  const elements = new Map(index.elements.map((element) => [element.ref, element]));
  const problems: ValidationProblem[] = [];
  if (plan.actions.length > index.maxActions) {
    problems.push(
      problem('high', `${plan.actions.length} actions planned; the limit is ${index.maxActions}`),
    );
  }
  let open = index.openTask;
  let afterFields = false;
  plan.actions.forEach((action, position) => {
    const at = [actionLocation(position)];
    if (isTerminal(action) && position !== plan.actions.length - 1) {
      problems.push(problem('high', `${action.kind} must be the last action`, at));
    }
    const task = taskFault(action, open);
    if (task !== null) problems.push(problem(task.severity, task.message, at));
    if (action.kind === 'taskStart') open = true;
    if (action.kind === 'taskDone') open = false;
    for (const fault of elementFaults(action, elements, { afterFields })) {
      problems.push(problem(fault.severity, fault.message, at));
    }
    if (action.kind === 'askFields') afterFields = true;
  });
  return problems;
};

export const referencesValidator: Validator<StepPlan> = indexedValidator(
  REFERENCES_VALIDATOR_ID,
  readIndex,
  references,
  [problem('critical', `the goal carries no ${BROWSER_STEP_PIPELINE_ID} index`)],
);

export const limitsValidator: Validator<StepPlan> = indexedValidator(
  LIMITS_VALIDATOR_ID,
  readIndex,
  limits,
  [],
);
