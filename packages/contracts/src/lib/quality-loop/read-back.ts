/**
 * How a program reads a finished run back when the artifact is a plan of
 * positional parts — a browser session's actions, a tool session's calls.
 * Nothing here judges: the loop's decision, with the blockers it names, and
 * the validators' problems are turned into one route per plan by declared
 * rules, so a plan runs only as far as nobody objected.
 *
 * The loop decides on the plan as a whole, and a plan it does not accept it
 * hands back to the program that asked. That program is what it is handed
 * back TO, and it reads where the blockers point before deciding what to do
 * with them: a blocker at a part costs that part and every one after it, and
 * nothing before it — a part only moves the state, and the parts ahead of a
 * faulted one were planned against the state the program has. A blocker at
 * the assessment, or with no location, objects to the plan's reading of the
 * state, and no part planned on a misread state is trusted. Measured on
 * 2026-10-07: six browser plans in a row whose first action would have taken
 * a session off an empty document were voided whole for a ref at action.2 or
 * action.3, and the session spent its failure budget without one browser
 * action.
 */
import { z, type ZodType } from 'zod';

import { bound, bounded, parseLenient } from '../bounds';
import type { IterationTrace } from './decision';
import type { SuccessCriterion } from './evidence';
import type { QualityRunDto } from './runs';

/** The iteration the run judged best, looked up by its number — never by its index. */
export function bestIterationOf(run: QualityRunDto): IterationTrace | null {
  const trace = run.trace;
  if (trace === null) return null;
  return trace.iterations.find((it) => it.iteration === trace.bestIteration) ?? null;
}

/** The zero-based position a location names, or null for another location. */
export function positionOf(location: string, grammar: RegExp): number | null {
  const match = grammar.exec(location);
  return match === null ? null : Number(match[1]) - 1;
}

/**
 * What a program carries forward about a plan that did not run: one entry
 * per objection, each kept whole.
 *
 * Sized from the live browser-step runs of 2026-10-03, where rationales
 * measured 245–600 characters (mean 398, p90 550) at 1–4 objections per plan,
 * and the loop caps a rationale at 900 before it is ever written here — so
 * nothing this holds is cut. That is the whole point of the bound. These
 * objections used to travel in a history entry's `note`, which is 300
 * characters and belongs to one action: the same plan-level text was copied
 * once per action, each copy cut at 300, and the cut landed on the clause
 * that said what to do instead. Measured live, a producer was handed ten
 * entries carrying two distinct objections, every copy ending mid-sentence
 * before its remedy, and five actions of duplication filled the history and
 * evicted the record of what the session had actually done. It then
 * proposed the same plan three times and the session stopped at its failure
 * rail.
 */
export const OBJECTIONS_BOUND = bound(6, 'list');
/** The most objections a program keeps at once, however many plans are refused in a row. */
export const OBJECTIONS_MAX = 16;
export const OBJECTION_FROM_MAX_LENGTH = 60;
export const OBJECTION_AT_BOUND = bound(8, 'list');
export const OBJECTION_AT_MAX_LENGTH = 40;
export const OBJECTION_DETAIL_BOUND = bound(900);

/**
 * One reason a plan did not run, as the objector put it. A critic's finding,
 * a validator's problem and the engine's own refusal are all objections: the
 * next plan has to answer any of them, so all travel the same way. A
 * plan-level objection names nothing in `at`.
 */
export const objectionSchema = z.strictObject({
  /** The program's step whose plan drew it. */
  step: z.number().int().min(1),
  /** Who objected: a critic's finding type, a validator's or a criterion's id, or one of the program's own objectors. */
  from: bounded.id(OBJECTION_FROM_MAX_LENGTH),
  /** Where in the refused plan it sat, as the objector located it. */
  at: bounded.list(OBJECTION_AT_BOUND, bounded.id(OBJECTION_AT_MAX_LENGTH)),
  /** What was said, in the objector's own words and not a word shorter. */
  detail: bounded.text(OBJECTION_DETAIL_BOUND, { min: 1 }),
});
export type Objection = z.infer<typeof objectionSchema>;

/** The two sentences a goal says around its objections, in the program's own terms: for none, and over the list. */
export interface ObjectionWording {
  none: string;
  heading: string;
}

/**
 * The objections the next plan must answer, newest first and each whole, by
 * the position it points at — never by the engine's step count or the id of
 * the lens or validator that raised it. Past the declared count the rest are
 * counted rather than cut.
 */
export function objectionLines(
  objections: readonly Objection[],
  wording: ObjectionWording,
): string[] {
  if (objections.length === 0) return [wording.none];
  const carried = objections.slice(0, OBJECTIONS_BOUND.target);
  const lines = carried.map((objection) => {
    const at = objection.at.length === 0 ? 'the plan as a whole' : objection.at.join(', ');
    return `- ${at} — ${objection.detail}`;
  });
  const rest = objections.length - carried.length;
  return [
    wording.heading,
    ...lines,
    ...(rest === 0 ? [] : [`(${rest} older objection(s) not listed)`]),
  ];
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
   * a block skipped every lens and nothing judged the parts before it.
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
 * planned on a misread state runs. Otherwise the first faulted position, or
 * null when nothing blocked at all.
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
 * reason says only that the plan was wrong. Advice that blocked nothing stays
 * on the run's record for a reader and is not carried: measured on
 * 2026-10-07, carried as objections, one critic's uncorroborated finding was
 * read by the next producer as a fact about the page. The evaluator's
 * shortfalls are carried because that lens read the page right 94 times in
 * 100 where the critics did not, and because a plan handed back on its score
 * alone would otherwise be told only "handed back".
 */
export function objectionsOf(
  iteration: IterationTrace,
  step: number,
  criteria: readonly SuccessCriterion[],
): Objection[] {
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

/** A plan of positional parts, as the reader needs to know it: how to parse it, address a part, count them, and which plans no later step can answer. */
export interface PositionalPlan<P> {
  schema: ZodType<P>;
  /** The grammar of a part's location, its one capture group the one-based position. */
  grammar: RegExp;
  /** The location of the part at a zero-based position. */
  locate(position: number): string;
  /** How many parts the plan has. */
  units(plan: P): number;
  /**
   * Whether the plan holds a part no next state can answer — a browser
   * session's terminate, a tool session's finish or irreversible call — so
   * that it runs only when the loop accepted it.
   */
  irrevocable(plan: P): boolean;
}

export interface PositionalReadout<P> {
  plan: P | null;
  executable: boolean;
  /** How many leading parts may run: all of an accepted plan, or those before the first a blocker pointed at. */
  executePrefix: number;
  reason: string | null;
  /** Why it did not run, or why its tail was cut: each objection whole, never folded into a part. */
  objections: Objection[];
  /** The criteria the evaluator settled `pass` on this plan, by id — what a program may settle once the state has moved. */
  passed: string[];
}

/** The criteria an iteration's ledger settled pass. */
const passedOf = (iteration: IterationTrace | null): string[] =>
  iteration === null
    ? []
    : iteration.ledger.criteria
        .filter((evidence) => evidence.result === 'pass')
        .map((evidence) => evidence.criterionId);

const notExecutable = <P>(
  plan: P | null,
  reason: string,
  objections: Objection[] = [],
  passed: string[] = [],
): PositionalReadout<P> => ({
  plan,
  executable: false,
  executePrefix: 0,
  reason,
  objections,
  passed,
});

/**
 * How much of a plan the program runs. The deterministic objections and the
 * rails decide what runs, not the score — the owner's directive:
 *
 * - a blocker that names the plan as a whole: nothing runs;
 * - a blocker or validator at a position: the parts before it run, since
 *   they were judged on this state and nobody objected to them — unless the
 *   evidence gate found the plan under-judged, when nobody read them;
 * - nothing cut: the whole plan runs, whatever the score, because a move's
 *   only check is the state it leads to. Held to the accept bar are only a
 *   plan the shape calls irrevocable — the one move no next state can
 *   answer — and an under-judged plan.
 *
 * Measured 2026-10-08: ten recorded browser sessions died on about:blank
 * because the opening `navigate` scored below the bar and was refused, so
 * the page never loaded; and holding a terminate to the bar is what still
 * refuses a `terminate mission-complete` a full page did not earn.
 */
export function routePositional<P>(
  run: QualityRunDto,
  step: number,
  shape: PositionalPlan<P>,
): PositionalReadout<P> {
  const best = bestIterationOf(run);
  if (best === null || best.artifact === null) return notExecutable<P>(null, 'no-artifact');
  const parsed = parseLenient(shape.schema, best.artifact);
  if (!parsed.ok) return notExecutable<P>(null, 'artifact does not match the plan schema');
  const plan = parsed.value;
  const blockers = blockersOf(best);
  const objections = objectionsOf(best, step, run.trace?.contract.criteria ?? []);
  const passed = passedOf(best);
  const cut = cutPointOf(blockers, shape.grammar);
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
    const held = !accepted && (shape.irrevocable(plan) || !best.decision.gates.evidenceSufficient);
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
          executePrefix: shape.units(plan),
          reason: null,
          objections,
          passed,
        };
  }
  if (cut === 0) {
    return notExecutable(plan, `${shape.locate(0)} was faulted`, objections, passed);
  }
  // The parts ahead of the cut were judged only if the lenses judged the
  // plan: a plan the evidence gate found under-assessed has a prefix nobody read.
  if (!best.decision.gates.evidenceSufficient) {
    return notExecutable(
      plan,
      `cut at ${shape.locate(cut)} but under-judged: ${best.decision.reason}`,
      objections,
      passed,
    );
  }
  // Handed back with the blockers at positions: the program runs up to the first.
  return { plan, executable: true, executePrefix: cut, reason: null, objections, passed };
}
