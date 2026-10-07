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
 * criterion's own statement, since an id says nothing to a producer. Advice
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
      detail: `${evidence.result}: ${statements.get(evidence.criterionId) ?? evidence.criterionId}`,
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
}

const notExecutable = (
  plan: StepPlan | null,
  reason: string,
  objections: StepObjection[] = [],
): PlanReadout => ({
  plan,
  executable: false,
  executePrefix: 0,
  reason,
  objections,
});

/**
 * A plan runs when the loop accepted it with its policy gate open and no
 * judge objected to the plan as a whole; then only up to the first action a
 * confirmed finding or a validation problem names.
 */
export function routePlan(run: QualityRunDto, step: number): PlanReadout {
  const best = bestIterationOf(run);
  if (best === null || best.artifact === null) return notExecutable(null, 'no-artifact');
  const parsed = parseLenient(stepPlanSchema, best.artifact);
  if (!parsed.ok) return notExecutable(null, 'artifact does not match the step plan schema');
  const plan = parsed.value;
  const blockers = blockersOf(best);
  const objections = objectionsOf(best, step, run.trace?.contract.criteria ?? []);
  const cut = cutPointOf(blockers, ACTION_LOCATION);
  if (cut === 'whole') {
    return notExecutable(
      plan,
      `a blocker names the plan as a whole: ${best.decision.reason}`,
      objections,
    );
  }
  if (cut === null) {
    // Nothing blocked, so the decision is about the plan's quality alone; a
    // plan the loop did not accept on that account is not run on it either.
    return run.trace?.finalDecision === 'accept'
      ? { plan, executable: true, executePrefix: plan.actions.length, reason: null, objections }
      : notExecutable(
          plan,
          `decided ${run.trace?.finalDecision ?? 'nothing'}: ${best.decision.reason}`,
          objections,
        );
  }
  if (cut === 0) return notExecutable(plan, 'the first action was faulted', objections);
  // The actions ahead of the cut were judged only if the lenses judged the
  // plan: a plan the evidence gate found under-assessed has a prefix nobody read.
  if (!best.decision.gates.evidenceSufficient) {
    return notExecutable(
      plan,
      `cut at ${actionLocation(cut)} but under-judged: ${best.decision.reason}`,
      objections,
    );
  }
  // Handed back with the blockers at positions: the session runs up to the first.
  return { plan, executable: true, executePrefix: cut, reason: null, objections };
}

export interface FieldReadout {
  position: number;
  field: FieldSpec;
  answer: FieldAnswer | null;
  route: FieldRoute;
  /** What to type or pick when the route is fill; the model's suggestion when the operator is asked. */
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
  value: answer?.value ?? null,
  source,
  reason,
  faults,
});

/**
 * One route per listed field, by declared order of precedence: the page's
 * admission, then the page's own facts (a hidden field stays blank whatever
 * the model said), then what a judge or a validator pointed at, then the
 * model's decision read with its confidence and basis.
 */
export function routeFields(
  run: QualityRunDto,
  admission: Admission,
  fields: readonly FieldSpec[],
): FieldReadout[] {
  const best = bestIterationOf(run);
  const parsed =
    best === null || best.artifact === null
      ? null
      : parseLenient(fieldAnswersSchema, best.artifact);
  const answers = new Map<string, FieldAnswer>(
    parsed?.ok ? parsed.value.fields.map((answer) => [answer.ref, answer]) : [],
  );
  const faulted =
    best === null
      ? new Map<number, string[]>()
      : faultedPositions(best, FIELD_LOCATION, best.ledger.findings);

  return fields.map((field, position) => {
    const answer = answers.get(field.ref) ?? null;
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
    if (admission !== 'admitted') {
      return readout(
        position,
        field,
        answer,
        'ask-operator',
        'engine',
        `page-escalated: ${admission}`,
      );
    }
    const faults = faulted.get(position) ?? [];
    if (faults.length > 0)
      return readout(position, field, answer, 'ask-operator', 'loop', 'faulted', faults);
    if (answer === null)
      return readout(position, field, null, 'ask-operator', 'engine', 'unanswered');
    switch (answer.decision) {
      case 'ask-operator':
        return readout(position, field, answer, 'ask-operator', 'loop', answer.reason);
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
      case 'answer': {
        const grounded = answer.basis.length > 0;
        if (answer.confidence === 'high' || (answer.confidence === 'medium' && grounded)) {
          return readout(
            position,
            field,
            answer,
            'fill',
            grounded ? 'memory' : 'loop',
            answer.reason,
          );
        }
        return readout(
          position,
          field,
          answer,
          'ask-operator',
          'loop',
          `${answer.confidence} confidence: ${answer.reason}`,
        );
      }
    }
  });
}
