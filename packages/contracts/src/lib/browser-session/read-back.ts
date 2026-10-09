/**
 * How the session reads a finished run back. Nothing here judges: the loop's
 * decision — with the blockers it names — the validators' problems and the
 * orchestrator's reported admission are turned into one route per action and
 * per field by declared rules, so a plan runs only as far as nobody objected
 * and a field is never filled when a judge pointed at it.
 *
 * The loop decides on the plan as a whole, and a plan it does not accept it
 * hands back to the session. The session is what it is handed back TO, and
 * it reads where the blockers point before deciding what to do with them: a
 * blocker at an action costs that action and every one after it, and nothing
 * before it — an action only moves a page, and the actions ahead of a faulted
 * one were planned against the page the session has. A blocker at the
 * assessment, or with no location, objects to the plan's reading of the page,
 * and no action planned on a misread page is trusted. Measured on 2026-10-07:
 * six plans in a row whose first action would have taken a session off an
 * empty document were voided whole for a ref at action.2 or action.3, and
 * the session spent its failure budget without one browser action.
 */
import { parseLenient } from '../bounds';
import type { Admission } from '../quality-loop/admission';
import type { IterationTrace } from '../quality-loop/decision';
import type { ConfirmedFinding, SuccessCriterion } from '../quality-loop/evidence';
import type { QualityRunDto } from '../quality-loop/runs';
import { fieldAnswersSchema, type FieldAnswer } from './field-answers.schema';
import type { FieldSpec } from './field-goal';
import type { StepObjection } from './observation.schema';
import { ACTION_LOCATION, actionLocation, FIELD_LOCATION, positionOf } from './pipelines';
import { stepPlanSchema, type StepPlan } from './step-plan.schema';
import type { BrowserDecisionSource, FieldRoute } from './vocab';

/** The iteration the run judged best, looked up by its number — never by its index. */
export function bestIterationOf(run: QualityRunDto): IterationTrace | null {
  const trace = run.trace;
  if (trace === null) return null;
  return trace.iterations.find((it) => it.iteration === trace.bestIteration) ?? null;
}

/** One thing that refused a plan or part of one, as the next goal will be told it. */
interface Objector {
  from: string;
  at: readonly string[];
  detail: string;
  /**
   * Whether where it points is where it cuts. A judge's finding and a cutting
   * validator's problem object to the positions they name; a BLOCKING
   * validator's problem objects to the whole artifact whatever it names, since
   * a block skipped every lens and nothing judged the actions before it.
   */
  positional: boolean;
}

/**
 * Everything the decision counted as blocking, each with where it points —
 * the problems of every validator that refused, the findings that blocked,
 * the gating criteria that failed — read from the decision's own account
 * (`decision.blocking`) and never re-derived from a policy this side does not
 * have. What a judge said that did NOT block is advice: it is priced on the
 * run and is not the next plan's to answer. Measured on 2026-10-07: carried
 * as objections, one critic's uncorroborated finding about a stop condition
 * an empty page could not show was read by the next producer as a fact
 * about the page, and twelve plans later the session was terminating for it.
 */
function blockersOf(iteration: IterationTrace): Objector[] {
  const { blocking } = iteration.decision;
  const objectors: Objector[] = [];
  for (const report of iteration.validation) {
    if (!blocking.validators.includes(report.validatorId)) continue;
    for (const problem of report.problems) {
      objectors.push({
        from: report.validatorId,
        at: problem.locationRefs,
        detail: problem.message,
        positional: report.gate === 'cut',
      });
    }
  }
  for (const finding of iteration.ledger.findings) {
    if (!blocking.findings.includes(finding.key)) continue;
    objectors.push({
      from: finding.type,
      at: finding.locationRefs,
      detail: finding.rationale || finding.type,
      positional: true,
    });
  }
  for (const evidence of iteration.ledger.criteria) {
    if (!blocking.criteria.includes(evidence.criterionId)) continue;
    objectors.push({
      from: evidence.criterionId,
      at: evidence.locationRefs,
      detail: `${evidence.criterionId} failed`,
      positional: true,
    });
  }
  return objectors;
}

/**
 * Where the blockers point, as one cut. `whole` when any blocker is not
 * positional, or names no position — no location, or one outside the grammar,
 * such as the assessment: it objects to the plan's reading, and nothing
 * planned on a misread page runs. Otherwise the first faulted position, or null when
 * nothing blocked at all.
 */
export function cutPointOf(
  objectors: readonly { at: readonly string[]; positional: boolean }[],
  grammar: RegExp,
): number | 'whole' | null {
  let first: number | null = null;
  for (const objector of objectors) {
    if (!objector.positional || objector.at.length === 0) return 'whole';
    for (const ref of objector.at) {
      const position = positionOf(ref, grammar);
      if (position === null) return 'whole';
      if (first === null || position < first) first = position;
    }
  }
  return first;
}

/**
 * The positions of a positional artifact that something pointed at, for a
 * caller that must leave every one of them alone — every validator's problem
 * and, when asked, every confirmed finding, blocking or not. A field writes
 * the applicant's own words into someone's form, so it is left alone wherever
 * ANY judge pointed; the costs are not symmetric with a plan's, and neither
 * is the rule.
 */
function faultedPositions(
  iteration: IterationTrace,
  grammar: RegExp,
  findings: readonly ConfirmedFinding[],
): Map<number, string[]> {
  const faults = new Map<number, string[]>();
  const add = (refs: readonly string[], what: string): void => {
    for (const ref of refs) {
      const position = positionOf(ref, grammar);
      if (position === null) continue;
      faults.set(position, [...(faults.get(position) ?? []), what]);
    }
  };
  for (const finding of findings) {
    add(
      finding.locationRefs,
      `${finding.type}${finding.rationale ? `: ${finding.rationale}` : ''}`,
    );
  }
  for (const report of iteration.validation) {
    for (const problem of report.problems)
      add(problem.locationRefs, `${report.validatorId}: ${problem.message}`);
  }
  return faults;
}

/**
 * What the next plan is told to answer: everything that refused or cut this
 * one, and every criterion the evaluator settled fail or partial — with the
 * criterion's statement and the evaluator's reason, the run's own remediation
 * note, since an id says nothing to a producer and a verdict without its
 * reason says only that the plan was wrong. Advice
 * that blocked nothing stays on the run's record for a reader and is not
 * carried: measured on 2026-10-07, carried as objections, one critic's
 * uncorroborated finding was read by the next producer as a fact about the
 * page. The evaluator's shortfalls are carried because that lens read the
 * page right 94 times in 100 where the critics did not, and because a plan
 * handed back on its score alone would otherwise be told only "handed back".
 */
export function objectionsOf(
  iteration: IterationTrace,
  step: number,
  criteria: readonly SuccessCriterion[],
): StepObjection[] {
  const statements = new Map(criteria.map((criterion) => [criterion.id, criterion.statement]));
  const reasons = new Map(
    iteration.remediations.flatMap((note) =>
      'criterion' in note.subject ? [[note.subject.criterion, note.note] as const] : [],
    ),
  );
  const blockers = blockersOf(iteration)
    .filter((objector) => !statements.has(objector.from))
    .map((objector) => ({
      step,
      from: objector.from,
      at: [...objector.at],
      detail: objector.detail,
    }));
  const shortfalls = iteration.ledger.criteria
    .filter((evidence) => evidence.result === 'fail' || evidence.result === 'partial')
    .map((evidence) => ({
      step,
      from: evidence.criterionId,
      at: [...evidence.locationRefs],
      detail: `${evidence.result}: ${
        reasons.get(evidence.criterionId) ??
        statements.get(evidence.criterionId) ??
        evidence.criterionId
      }`,
    }));
  return [...blockers, ...shortfalls];
}

export interface PlanReadout {
  plan: StepPlan | null;
  executable: boolean;
  /** How many leading actions may run: all of an accepted plan, or those before the first a blocker pointed at. */
  executePrefix: number;
  reason: string | null;
  /** Why it did not run, or why its tail was cut: each objection whole, never folded into an action. */
  objections: StepObjection[];
  /** The criteria the evaluator settled `pass` on this plan, by id — what a session may settle once the page has moved. */
  passed: string[];
}

/** The criteria an iteration's ledger settled pass. */
const passedOf = (iteration: IterationTrace | null): string[] =>
  iteration === null
    ? []
    : iteration.ledger.criteria
        .filter((evidence) => evidence.result === 'pass')
        .map((evidence) => evidence.criterionId);

const notExecutable = (
  plan: StepPlan | null,
  reason: string,
  objections: StepObjection[] = [],
  passed: string[] = [],
): PlanReadout => ({
  plan,
  executable: false,
  executePrefix: 0,
  reason,
  objections,
  passed,
});

/**
 * A plan runs when the loop accepted it with its policy gate open and no
 * judge objected to the plan as a whole; then only up to the first action a
 * confirmed finding or a validation problem names.
 *
 * Two readings of one decision, by declared policy. A plan something cut at a
 * position runs up to that position whatever the score, because the actions
 * before the cut were judged on this page and nobody objected to them. A plan
 * nothing cut runs whole whatever the score too — a plan is work the session
 * does, and a move's only check is the page it leads to — except a `terminate`
 * ends the session and only the judges verify it, so a terminate the loop did
 * not accept is held back, as is a plan the evidence gate found under-judged.
 * Both readings are the owner's directive that the deterministic objections
 * and the rails, not the score, decide what the browser does; the score gates
 * the one irreversible action and the verdict recorded. Measured 2026-10-08:
 * ten recorded sessions died on about:blank because the opening `navigate`
 * scored below the bar and was refused, so the page never loaded; and holding
 * a terminate to the bar is what still refuses a `terminate mission-complete`
 * a full page did not earn.
 */
export function routePlan(run: QualityRunDto, step: number): PlanReadout {
  const best = bestIterationOf(run);
  if (best === null || best.artifact === null) return notExecutable(null, 'no-artifact');
  const parsed = parseLenient(stepPlanSchema, best.artifact);
  if (!parsed.ok) return notExecutable(null, 'artifact does not match the step plan schema');
  const plan = parsed.value;
  const blockers = blockersOf(best);
  const objections = objectionsOf(best, step, run.trace?.contract.criteria ?? []);
  const passed = passedOf(best);
  const cut = cutPointOf(blockers, ACTION_LOCATION);
  if (cut === 'whole') {
    return notExecutable(
      plan,
      `a blocker names the plan as a whole: ${best.decision.reason}`,
      objections,
      passed,
    );
  }
  if (cut === null) {
    // Nothing objected to this plan. A plan is work the session does, not a
    // draft to grade: its actions run, and the next observation is the only
    // check a move needs — a move that went wrong shows in the page it led
    // to, and the rails bound a plan that moves and achieves nothing. Two
    // things stay held to the accept bar, because neither is a move the page
    // can answer: a `terminate` ENDS the session, so one the loop did not
    // accept (a mission-complete the judges scored low) is handed back rather
    // than run; and a plan the evidence gate found under-assessed had a
    // prefix no lens read. Measured 2026-10-08: a correct opening `navigate`
    // off about:blank scored 30 — its grounding criteria had nothing to
    // ground and its one mission step read as not-yet-done — was refused for
    // being below the bar, and the page never loaded, so the session died on
    // the launchpad over three such steps; while `taskDone; terminate
    // mission-complete` on a full results page was validator-clean, so
    // holding a terminate to the bar is what keeps a false completion from
    // ending the session.
    const accepted = run.trace?.finalDecision === 'accept';
    const endsSession = plan.actions.some((action) => action.kind === 'terminate');
    const held = !accepted && (endsSession || !best.decision.gates.evidenceSufficient);
    return held
      ? notExecutable(
          plan,
          `decided ${run.trace?.finalDecision ?? 'nothing'}: ${best.decision.reason}`,
          objections,
          passed,
        )
      : {
          plan,
          executable: true,
          executePrefix: plan.actions.length,
          reason: null,
          objections,
          passed,
        };
  }
  if (cut === 0) return notExecutable(plan, 'the first action was faulted', objections, passed);
  // The actions ahead of the cut were judged only if the lenses judged the
  // plan: a plan the evidence gate found under-assessed has a prefix nobody read.
  if (!best.decision.gates.evidenceSufficient) {
    return notExecutable(
      plan,
      `cut at ${actionLocation(cut)} but under-judged: ${best.decision.reason}`,
      objections,
      passed,
    );
  }
  // Handed back with the blockers at positions: the session runs up to the first.
  return { plan, executable: true, executePrefix: cut, reason: null, objections, passed };
}

export interface FieldReadout {
  position: number;
  field: FieldSpec;
  answer: FieldAnswer | null;
  route: FieldRoute;
  /** What to type or pick when the route is fill; what the field holds when it is keep; the model's suggestion when the operator is asked. */
  value: string | null;
  source: BrowserDecisionSource;
  reason: string;
  faults: string[];
}

const readout = (
  position: number,
  field: FieldSpec,
  answer: FieldAnswer | null,
  route: FieldRoute,
  source: BrowserDecisionSource,
  reason: string,
  faults: string[] = [],
): FieldReadout => ({
  position,
  field,
  answer,
  route,
  value: route === 'keep' ? field.value : (answer?.value ?? null),
  source,
  reason,
  faults,
});

/** What the field holds already, as a value worth a keep: non-empty. */
const holds = (field: FieldSpec): boolean => field.value !== null && field.value !== '';

/** The answers of the best iteration by ref, when its artifact read as answers. */
const answersOf = (best: IterationTrace | null): Map<string, FieldAnswer> => {
  const parsed =
    best === null || best.artifact === null
      ? null
      : parseLenient(fieldAnswersSchema, best.artifact);
  return new Map(parsed?.ok ? parsed.value.fields.map((answer) => [answer.ref, answer]) : []);
};

/** One field as it is being routed: where it sits, what the page says of it, and what the model said. */
interface FieldCase {
  position: number;
  field: FieldSpec;
  answer: FieldAnswer | null;
}

/** A field the answers could not settle: the operator's when required, else left blank and said so. */
const unsettled = (
  { position, field, answer }: FieldCase,
  source: BrowserDecisionSource,
  reason: string,
  faults: string[] = [],
): FieldReadout =>
  field.required
    ? readout(position, field, answer, 'ask-operator', source, reason, faults)
    : readout(
        position,
        field,
        answer,
        'leave-blank',
        source,
        `optional, left blank: ${reason}`,
        faults,
      );

/** The model's decision, read with its confidence and basis once nothing on the page or in the run has settled the field. */
function answerRoute(fieldCase: FieldCase, answer: FieldAnswer): FieldReadout {
  const { position, field } = fieldCase;
  const grounded = answer.basis.length > 0;
  const source = grounded ? 'memory' : 'loop';
  switch (answer.decision) {
    case 'keep':
      return holds(field)
        ? readout(position, field, answer, 'keep', source, answer.reason)
        : unsettled(fieldCase, 'loop', `nothing to keep: ${answer.reason}`);
    case 'ask-operator':
      return unsettled(fieldCase, 'loop', answer.reason);
    case 'leave-blank':
      return field.required
        ? readout(
            position,
            field,
            answer,
            'ask-operator',
            'loop',
            `required field left blank: ${answer.reason}`,
          )
        : readout(position, field, answer, 'leave-blank', 'blank', answer.reason);
    case 'answer':
      // An answer that says what the field holds is a keep: nothing is typed over itself.
      if (holds(field) && answer.value === field.value) {
        return readout(
          position,
          field,
          answer,
          'keep',
          source,
          `holds it already: ${answer.reason}`,
        );
      }
      if (answer.confidence === 'high' || (answer.confidence === 'medium' && grounded)) {
        return readout(position, field, answer, 'fill', source, answer.reason);
      }
      return unsettled(fieldCase, 'loop', `${answer.confidence} confidence: ${answer.reason}`);
  }
}

/**
 * One field's route, by declared order of precedence: the page's own facts
 * first (a hidden field stays blank whatever the model said), then an
 * admission that says nothing was judged at all, then what a judge or a
 * validator pointed at, then the model's decision.
 */
function fieldRoute(
  fieldCase: FieldCase,
  admission: Admission,
  faults: readonly string[],
): FieldReadout {
  const { position, field, answer } = fieldCase;
  if (field.hiddenTraits.length > 0) {
    return readout(
      position,
      field,
      answer,
      'leave-blank',
      'blank',
      'trap-skipped: the page hides this field',
    );
  }
  if (admission === 'no-rubric' || admission === 'no-artifact') {
    return unsettled(fieldCase, 'engine', `page-escalated: ${admission}`);
  }
  if (faults.length > 0) return unsettled(fieldCase, 'loop', 'faulted', [...faults]);
  if (answer === null) return unsettled(fieldCase, 'engine', 'unanswered');
  return answerRoute(fieldCase, answer);
}

/**
 * One route per listed field, by declared order of precedence: the page's
 * own facts first (a hidden field stays blank whatever the model said), then
 * an admission that says nothing was judged at all, then what a judge or a
 * validator pointed at, then the model's decision read with its confidence
 * and basis. The operator is asked only for a required field: an optional
 * one the answers could not settle is left blank, and the row says why.
 *
 * A run that fell short is recorded on the row and demotes nothing by
 * itself: the judges' objections arrive as faults at the fields they are
 * about, and the fields they are not about are read on their own merits.
 * Measured 2026-10-07: a page whose run fell short on one unanswerable
 * field sent all three of its fields to the operator — two answered right
 * from memory, all three already filled by the site — and two optional
 * search controls asked as fields cost twelve minutes at the terminal.
 */
export function routeFields(
  run: QualityRunDto,
  admission: Admission,
  fields: readonly FieldSpec[],
): FieldReadout[] {
  const best = bestIterationOf(run);
  const answers = answersOf(best);
  const faulted =
    best === null
      ? new Map<number, string[]>()
      : faultedPositions(best, FIELD_LOCATION, best.ledger.findings);
  return fields.map((field, position) =>
    fieldRoute(
      { position, field, answer: answers.get(field.ref) ?? null },
      admission,
      faulted.get(position) ?? [],
    ),
  );
}
