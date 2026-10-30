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
  actionDetail,
  actionLocation,
  actionRefs,
  CLAIMING_ACTION_KINDS,
  describeForbiddenCut,
  describeTakenCut,
  matchesRecord,
  MUTATING_ACTION_KINDS,
  ON_RECORD_TAKEN,
  PAGE_REPLACING_ACTION_KINDS,
  PAGE_REPLACING_WAITS,
  TERMINAL_ACTION_KINDS,
  type Severity,
  type StepAction,
  type StepIndex,
  type StepPlan,
  type ValidationProblem,
  quotedJson,
} from '@sysdesign/contracts';

import {
  indexedValidator,
  LIMITS_VALIDATOR_ID,
  problem,
  REFERENCES_VALIDATOR_ID,
  unlisted,
  type IndexedRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { BROWSER_STEP_PIPELINE_ID, readIndex } from './input';

export { LIMITS_VALIDATOR_ID, REFERENCES_VALIDATOR_ID };

type Rule = IndexedRule<StepPlan, StepIndex>;
type Element = StepIndex['elements'][number];
type Fault = { severity: Severity; message: string };

/** Every ref an action cites is one the page listed; located at the action, so the caller stops before it. */
const references: Rule = (plan, index) =>
  unlisted(
    index.elements.map((element) => element.ref),
    plan.actions.flatMap((action, position) =>
      actionRefs(action).map((ref) => ({ ref, at: [actionLocation(position)] })),
    ),
    (ref) => `${ref} is not a listed element`,
  );

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
 * Whether an action touches the element it cites, from the declared effects:
 * a touch on a disabled element fails in the browser; waiting for one or
 * scrolling it into view does not, and a plan that waits for a Submit
 * control to become enabled is the ordinary shape of a wizard page.
 */
const touches = (action: StepAction): boolean => ACTION_EFFECTS[action.kind].touches;
/** Whether a touch needs the element in sight, from the declared effects: a file setter does not, and a file control is routinely hidden behind the page's own button. */
const needsSight = (action: StepAction): boolean =>
  touches(action) && ACTION_EFFECTS[action.kind].sight;

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
    if (needsSight(action) && !element.visible && element.hiddenTraits.length === 0) {
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
    // The mission's word on the item, declared as data and written into the
    // index: an element carrying a mark is passed over. Measured 2026-10-07,
    // twice live: a planner told in prose to pass over a card whose name
    // carried the word clicked that card fifteen times in one session.
    if (
      (action.kind === 'fill' || action.kind === 'select' || action.kind === 'click') &&
      element.marks.length > 0
    ) {
      fault(
        'high',
        `${ref} is marked ${element.marks.map(quotedJson).join(' and ')}: the mission passes such an item over, so it is never touched`,
      );
    }
    if (action.kind === 'fill' && element.kind !== 'fillable') {
      fault('high', `${ref} cannot be typed into (${element.kind})`);
    }
    if (action.kind === 'select') {
      // A control typed into that lists options is chosen from too: the
      // select types the option's words and chooses it, and the list it shows
      // is only what it offers for the words it holds, so any words may pass.
      if (element.kind !== 'selectable' && element.options === null) {
        fault('high', `${ref} offers nothing to select (${element.kind})`);
      } else if (
        element.kind === 'selectable' &&
        element.options !== null &&
        element.optionsOmitted === 0 &&
        !element.options.includes(action.option)
      ) {
        fault('high', `${quotedJson(action.option)} is not an option of ${ref}`);
      }
    }
    if (
      action.kind === 'askFields' &&
      element.kind !== 'fillable' &&
      element.kind !== 'selectable'
    ) {
      fault('high', `${ref} is not a field to answer (${element.kind})`);
    }
    if (action.kind === 'upload' && element.kind !== 'uploadable') {
      fault(
        'high',
        `${ref} is not a file control (${element.kind}): an upload puts a document into a file control alone`,
      );
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

/**
 * An action that ran at the last step on a page that did not change — the
 * same kind on the same element, with the same detail — asks the page the
 * question it has answered. Measured 2026-10-08: nine of 31 steps were one
 * click on one already-selected card, repeated.
 */
const repeatFault = (action: StepAction, index: StepIndex): string | null => {
  if (!index.pageUnchanged) return null;
  const ref = actionRefs(action)[0] ?? null;
  const detail = actionDetail(action);
  const repeated = index.lastRan.some(
    (ran) => ran.kind === action.kind && ran.ref === ref && ran.detail === detail,
  );
  if (!repeated) return null;
  return `${action.kind}${ref === null ? '' : ` on ${ref}`} ran at the last step and the page did not change: repeating it is cut — act on another element this page lists, press a different key, scroll, or open or close the unit of work from what the page shows now`;
};

/**
 * A terminate for a cause the mission ties to words rests on those words
 * being shown. Measured 2026-10-08: a session ended `limit-reached` on a
 * results page that showed no word about a limit — the plan rested on a
 * critic's sentence about a mark, and the evaluator read the same words.
 * On a page that shows nothing the claim rule above already refuses it.
 */
/**
 * A terminate names one of the stops the mission declares: the cause is the
 * mission's word, and a cause it never declared would end the session on
 * nothing the mission said.
 */
const causeFault = (action: StepAction, index: StepIndex): string | null =>
  action.kind === 'terminate' && !index.causes.includes(action.cause)
    ? `terminate ${action.cause}: the mission declares no such stop condition — it declares ${index.causes.join(', ') || 'none'}`
    : null;

/**
 * An upload names one of the documents the mission declares: the run supplied
 * a file for each of those and for nothing else, so a name the mission never
 * declared is a file nobody has — and a mission that declares none lets
 * nothing be uploaded.
 */
const documentFault = (action: StepAction, index: StepIndex): string | null =>
  action.kind === 'upload' && !index.documents.includes(action.document)
    ? `upload ${action.document}: the mission declares no such document — it declares ${index.documents.join(', ') || 'none'}`
    : null;

const stopFault = (action: StepAction, index: StepIndex): string | null => {
  if (action.kind !== 'terminate' || !index.pageShowsContent) return null;
  const tied = index.stops.filter((stop) => stop.cause === action.cause);
  if (tied.length === 0 || tied.some((stop) => stop.shown)) return null;
  return `terminate ${action.cause}: the mission ties it to the words ${tied.map((stop) => quotedJson(stop.token)).join(' or ')}, which this page does not show`;
};

/**
 * A taskStart carries the unit's identity as the facts the mission declares,
 * each once with a value, and no other: a record beyond this session names
 * units by exactly these, so a claim missing one, or inventing one, is a unit
 * nobody could look up. Blank values are a structural fault the schema already
 * refuses; here the names are held to the index.
 */
const facetsFault = (action: StepAction, index: StepIndex): string | null => {
  if (action.kind !== 'taskStart') return null;
  const named = action.facets.map((facet) => facet.name);
  const declared = index.unitFacets;
  const missing = declared.filter((name) => !named.includes(name));
  const undeclared = named.filter((name) => !declared.includes(name));
  const repeated = named.filter((name, position) => named.indexOf(name) !== position);
  if (missing.length === 0 && undeclared.length === 0 && repeated.length === 0) return null;
  const faults = [
    ...(missing.length > 0 ? [`lacks ${missing.join(', ')}`] : []),
    ...(undeclared.length > 0
      ? [`names ${undeclared.join(', ')}, which the mission does not declare`]
      : []),
    ...(repeated.length > 0 ? [`names ${[...new Set(repeated)].join(', ')} twice`] : []),
  ];
  return `taskStart ${faults.join('; ')}: a unit's identity is ${
    declared.length === 0
      ? 'no facet, since the mission declares none'
      : `exactly ${declared.join(', ')}`
  }`;
};

/**
 * A unit on record as forbidden is never started: the identities an advisor
 * put in the index are compared to the claim by the one key every process
 * uses, and the record's own note is said back with the alternative, in the
 * words the session's refusal and the Limits use, so the next plan knows why
 * and what instead.
 */
const forbiddenFault = (action: StepAction, index: StepIndex): string | null => {
  if (action.kind !== 'taskStart') return null;
  const hit = index.unitsForbidden.find((unit) => matchesRecord(action.facets, unit.identity));
  return hit === undefined ? null : describeForbiddenCut(hit);
};

/**
 * A taskStart's declaration that it takes a unit on record is held to the
 * exception the mission declares, from the index alone: cut where the mission
 * declares none, and where every stance it declares is withheld by a control
 * this page lists. Which unit it takes, and whether that unit is on record at
 * all, is the session's check against the whole record.
 */
const takenFault = (action: StepAction, index: StepIndex): string | null =>
  action.kind === 'taskStart' && action[ON_RECORD_TAKEN] === true
    ? describeTakenCut(index.onRecordTaken)
    : null;

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
    // A terminal action ends the plan: what follows it would act on a page this
    // plan has not observed. Closing a unit of work is not terminal — it is
    // bookkeeping that touches no page — and the stale-claim rule below holds
    // it to the page as observed.
    if (isTerminal(action) && position !== plan.actions.length - 1) {
      problems.push(problem('high', `${action.kind} must be the last action`, at));
    }
    const claim = claimFault(action, index.pageShowsContent);
    if (claim !== null) problems.push(problem(claim.severity, claim.message, at));
    const repeat = repeatFault(action, index);
    if (repeat !== null) problems.push(problem('high', repeat, at));
    const cause = causeFault(action, index);
    if (cause !== null) problems.push(problem('high', cause, at));
    const document = documentFault(action, index);
    if (document !== null) problems.push(problem('high', document, at));
    const stop = stopFault(action, index);
    if (stop !== null) problems.push(problem('high', stop, at));
    const facets = facetsFault(action, index);
    if (facets !== null) problems.push(problem('high', facets, at));
    const forbidden = forbiddenFault(action, index);
    if (forbidden !== null) problems.push(problem('high', forbidden, at));
    const taken = takenFault(action, index);
    if (taken !== null) problems.push(problem('high', taken, at));
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
