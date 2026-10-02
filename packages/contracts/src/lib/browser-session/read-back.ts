/**
 * How the session reads a finished run back. Nothing here judges: the loop's
 * decision, its confirmed findings and the orchestrator's reported admission
 * are turned into one route per action and per field by declared rules, so a
 * plan runs only as far as nobody objected and a field is never filled when
 * a judge pointed at it.
 */
import type { Admission } from '../quality-loop/admission';
import type { IterationTrace } from '../quality-loop/decision';
import type { QualityRunDto } from '../quality-loop/runs';
import { fieldAnswersSchema, type FieldAnswer } from './field-answers.schema';
import type { FieldSpec } from './field-goal';
import { ACTION_LOCATION, FIELD_LOCATION, positionOf } from './pipelines';
import { stepPlanSchema, type StepPlan } from './step-plan.schema';
import type { BrowserDecisionSource, FieldRoute } from './vocab';

/** The iteration the run judged best, looked up by its number — never by its index. */
export function bestIterationOf(run: QualityRunDto): IterationTrace | null {
  const trace = run.trace;
  if (trace === null) return null;
  return trace.iterations.find((it) => it.iteration === trace.bestIteration) ?? null;
}

/** The positions (zero-based) under a location grammar that a finding or a validation problem points at. */
function faultedPositions(iteration: IterationTrace, grammar: RegExp): Map<number, string[]> {
  const faults = new Map<number, string[]>();
  const add = (refs: readonly string[], what: string): void => {
    for (const ref of refs) {
      const position = positionOf(ref, grammar);
      if (position === null) continue;
      faults.set(position, [...(faults.get(position) ?? []), what]);
    }
  };
  for (const finding of iteration.ledger.findings) {
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

export interface PlanReadout {
  plan: StepPlan | null;
  executable: boolean;
  /** How many leading actions may run: those before the first one a judge or a validator pointed at. */
  executePrefix: number;
  reason: string | null;
  /** What stopped or shortened it, for the next goal's recent-actions section. */
  faults: string[];
}

const notExecutable = (
  plan: StepPlan | null,
  reason: string,
  faults: string[] = [],
): PlanReadout => ({
  plan,
  executable: false,
  executePrefix: 0,
  reason,
  faults,
});

/**
 * A plan runs when the loop accepted it with its policy gate open and no
 * judge objected to the plan as a whole; then only up to the first action a
 * confirmed finding or a validation problem names.
 */
export function routePlan(run: QualityRunDto): PlanReadout {
  const best = bestIterationOf(run);
  if (best === null || best.artifact === null) return notExecutable(null, 'no-artifact');
  const parsed = stepPlanSchema.safeParse(best.artifact);
  if (!parsed.success) return notExecutable(null, 'artifact does not match the step plan schema');
  const plan = parsed.data;
  const findings = best.ledger.findings.map(
    (finding) => `${finding.type}${finding.rationale ? `: ${finding.rationale}` : ''}`,
  );
  if (run.trace?.finalDecision !== 'accept') {
    return notExecutable(
      plan,
      `decided ${run.trace?.finalDecision ?? 'nothing'}: ${best.decision.reason}`,
      findings,
    );
  }
  if (!best.decision.gates.policyAllowed) {
    return notExecutable(plan, `policy gate closed: ${best.decision.reason}`, findings);
  }
  if (best.ledger.findings.some((finding) => finding.locationRefs.length === 0)) {
    return notExecutable(plan, 'a confirmed finding names the whole plan', findings);
  }
  const faulted = faultedPositions(best, ACTION_LOCATION);
  const first = [...faulted.keys()].sort((a, b) => a - b)[0];
  const executePrefix = first === undefined ? plan.actions.length : first;
  if (executePrefix === 0)
    return notExecutable(plan, 'the first action was faulted', [...faulted.values()].flat());
  return {
    plan,
    executable: true,
    executePrefix,
    reason: null,
    faults: [...faulted.values()].flat(),
  };
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
    best === null || best.artifact === null ? null : fieldAnswersSchema.safeParse(best.artifact);
  const answers = new Map<string, FieldAnswer>(
    parsed?.success ? parsed.data.fields.map((answer) => [answer.ref, answer]) : [],
  );
  const faulted =
    best === null ? new Map<number, string[]>() : faultedPositions(best, FIELD_LOCATION);

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
