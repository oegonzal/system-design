/**
 * A plan read back. The loop decides on the plan as a whole, and a plan it
 * does not accept it hands back to the session. The session is what it is
 * handed back TO, and it reads where the blockers point before deciding what to do with them: a
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
import type { IterationTrace } from '../quality-loop/decision';
import type { SuccessCriterion } from '../quality-loop/evidence';
import type { QualityRunDto } from '../quality-loop/runs';
import type { StepObjection } from './observation.schema';
import { ACTION_EFFECTS } from './action-effects';
import { ACTION_LOCATION, actionLocation, positionOf } from './pipelines';
import { bestIterationOf } from './read-back';
import { stepPlanSchema, type StepPlan } from './step-plan.schema';

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
 * How much of a plan the session runs. The deterministic objections and the
 * rails decide what the browser does, not the score — the owner's directive:
 *
 * - a blocker that names the plan as a whole: nothing runs;
 * - a blocker or validator at a position: the actions before it run, since
 *   they were judged on this page and nobody objected to them — unless the
 *   evidence gate found the plan under-judged, when nobody read them;
 * - nothing cut: the whole plan runs, whatever the score, because a move's
 *   only check is the page it leads to. Held to the accept bar are only a
 *   plan carrying an action that ends the session (`ActionEffects.endsSession`
 *   — the one move no next page can answer) and an under-judged plan.
 *
 * Measured 2026-10-08: ten recorded sessions died on about:blank because the
 * opening `navigate` scored below the bar and was refused, so the page never
 * loaded; and holding a terminate to the bar is what still refuses a
 * `terminate mission-complete` a full page did not earn.
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
    const accepted = run.trace?.finalDecision === 'accept';
    const endsSession = plan.actions.some((action) => ACTION_EFFECTS[action.kind].endsSession);
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
