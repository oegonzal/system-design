/**
 * A pipeline is data: which kinds of criteria and findings exist, which lenses
 * look (each with an md persona), the policy that prices their evidence, and
 * the controller that turns the priced evidence into a decision. The only code
 * a pipeline brings is its `OutputShape` (how to parse, address and render the
 * artifact), any deterministic validators, and — by reference, like a
 * validator — the controller it declares from `core/controllers`.
 *
 * This file is the declaration alone. `validate-pipeline.ts` is what boot
 * checks a declaration against; `describe-pipeline.ts` is the projection the
 * HTTP surface and the dump carry.
 */

import type {
  DecisionPolicy,
  EvidenceLedger,
  GoalSource,
  ProducerBriefing,
  UpstreamEvidence,
} from '@sysdesign/contracts';

import type { TaskSpec } from './contracts';
import type { Controller, Validator } from './ports';

/** What every lens declares: who it is, how often it samples, how much it may write. */
export interface LensSpec {
  id: string;
  /** The lens's expertise, as markdown text — imported with `?raw` beside the pipeline. */
  persona: string;
  /** Independent samples per iteration; agreement across them is what confirms an item. */
  samples: number;
  maxTokens: number;
}

/**
 * A critic: defect-oriented, so it declares how many findings a sample may
 * name and which types it owns. Every critic judges the artifact alone, in
 * the first wave.
 */
export interface CriticSpec extends LensSpec {
  /** Cap on findings per sample, in the response schema. */
  maxItems: number;
  /**
   * The finding types this lens may emit — its response schema offers only
   * these, and the types section names only these. Undeclared, every type the
   * task knows. A persona that says "whether the plan is safe is the other
   * critic's concern" is prose; measured 2026-10-07, 36 of one critic's 55
   * findings were of the other critic's types, each restating the other's
   * hallucination so the two read as agreement. The declaration is what binds.
   */
  findingTypes?: readonly string[];
}

/**
 * An evaluator: criteria-oriented. It answers every criterion of its kinds,
 * once — the response schema asks for exactly that many results, so a reply
 * that stops short is refused and asked again rather than read as a verdict.
 * Measured 2026-10-08: with the results bounded only from above, an evaluator
 * answered 10 of 18 criteria in six of 23 step runs, and each such plan was
 * refused whole as under-judged.
 */
export interface EvaluatorSpec extends LensSpec {
  /** The criterion kinds this evaluator judges — each kind has exactly one judge. */
  criterionKinds: readonly string[];
  /**
   * What it judges with beyond the artifact. Empty: it runs in the first wave,
   * beside the critics, from the artifact alone. `findings`: it runs after the
   * critics and is shown what the normaliser CONFIRMED from them — never a raw
   * report. The declaration drives both when it runs and what it is shown.
   */
  consumes: readonly UpstreamEvidence[];
}

export interface StageSpec {
  persona: string;
  maxTokens: number;
}

export interface ProducerSpec extends StageSpec {
  /**
   * What the first draft is briefed with beyond the goal. Empty withholds the
   * derived criteria, so the artifact must meet the brief rather than echo the
   * checklist it will be graded against. Remediations on revise and retry are
   * unaffected: feedback is not the answer key.
   */
  consumes: readonly ProducerBriefing[];
  /**
   * What a first draft is asked for, in the pipeline's own terms; unset, the
   * engine asks for the artifact — addressing every success criterion when the
   * producer is shown them. A pipeline whose checklist covers more than one
   * artifact says what part of it this artifact serves. Measured 2026-10-08:
   * told to address every criterion, a planner for one page ended five of 23
   * plans with a stop the page did not show and planned the whole mission in
   * eight actions on nine.
   */
  instruction?: string;
}

export interface PipelineDefinition<T> {
  id: string;
  version: string;
  description: string;
  /**
   * What kind of goal the pipeline takes: a brief a person typed, or a goal
   * another program composed. Validated at boot and projected into the
   * summary; the orchestrators, the router and the loop UI read it there —
   * never a list of ids kept somewhere else.
   */
  goalSource: GoalSource;
  task: TaskSpec<T>;
  deriveCriteria: StageSpec;
  producer: ProducerSpec;
  validators: readonly Validator<T>[];
  critics: readonly CriticSpec[];
  evaluators: readonly EvaluatorSpec[];
  /** The deterministic strategy that decides — declared by reference, composed in `core/controllers`. */
  controller: Controller;
  policy: DecisionPolicy;
  /**
   * An optional pass that corrects the ledger from facts the goal already
   * declares, applied once per iteration before the controller decides — for a
   * pipeline whose goal carries context the judges cannot be trusted to honour.
   * browser-step uses it so a stop the page cannot be showing (a contentless
   * page) does not gate the move that would leave it. A pipeline that declares
   * none is unaffected; the controller still owns the decision, on a ledger the
   * engine has corrected rather than one a model alone wrote.
   */
  refoundEvidence?: (
    ledger: EvidenceLedger,
    goal: string,
    policy: DecisionPolicy,
  ) => EvidenceLedger;
}
