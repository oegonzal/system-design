/**
 * A pipeline is data: which kinds of criteria and findings exist, which lenses
 * look (each with an md persona), the policy that prices their evidence, and
 * the controller that turns the priced evidence into a decision. The only code
 * a pipeline brings is its `OutputShape` (how to parse, address and render the
 * artifact), any deterministic validators, and — by reference, like a
 * validator — the controller it declares from `core/controllers`.
 */
import type {
  DecisionPolicy,
  EvidenceLedger,
  GoalSource,
  PipelineSummary,
  ProducerBriefing,
  UpstreamEvidence,
} from '@sysdesign/contracts';
import {
  GOAL_SOURCES,
  MAX_PROVIDED_STATEMENT_LENGTH,
  modelSchema,
  PRODUCER_BRIEFING,
  UPSTREAM_EVIDENCE,
  WITHHOLDINGS,
} from '@sysdesign/contracts';
import { strictSchemaFaults } from '@sysdesign/llm';

import { projectStep, SCORES_FACTOR } from './controllers/compose';
import { criterionLengthBound, providedStatementLimit, type TaskSpec } from './contracts';
import { validatePolicy } from './policy';
import type { Controller, Validator } from './ports';
import { BOUNDS_VALIDATOR_ID, SCHEMA_VALIDATOR_ID } from './stages/schema-validator';

export interface LensSpec {
  id: string;
  /** The lens's expertise, as markdown text — imported with `?raw` beside the pipeline. */
  persona: string;
  /** Independent samples per iteration; agreement across them is what confirms an item. */
  samples: number;
  /** Cap on items per sample, in the response schema. */
  maxItems: number;
  maxTokens: number;
  /**
   * Upstream ledger evidence this lens judges with. Empty: it runs in the
   * first wave from the artifact alone. Non-empty: it runs after that wave and
   * is shown what the normaliser CONFIRMED from it — never a raw report. The
   * declaration drives both when the lens runs and what it is shown.
   */
  consumes: readonly UpstreamEvidence[];
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

export interface EvaluatorSpec extends LensSpec {
  /** The criterion kinds this evaluator judges — each kind has exactly one judge. */
  criterionKinds: readonly string[];
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
  critics: readonly LensSpec[];
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

/** Stage ids the engine owns; a lens may not take one. */
const RESERVED_STAGE_IDS = ['producer', 'criteria', 'lenses'] as const;

/** The validators the engine runs on every artifact, first; a pipeline's own may not take their ids. */
const ENGINE_VALIDATOR_IDS: readonly string[] = [SCHEMA_VALIDATOR_ID, BOUNDS_VALIDATOR_ID];

const describePipelineId = (definition: PipelineDefinition<unknown>): string =>
  `${definition.id}@${definition.version}`;

type Fail = (message: string) => never;
type Definition = PipelineDefinition<unknown>;

/** Every lens: a unique, unreserved id, enough samples to ever confirm anything, sane caps, a persona. */
function checkLenses(definition: Definition, fail: Fail): void {
  const lenses = [...definition.critics, ...definition.evaluators];
  const ids = lenses.map((lens) => lens.id);
  if (new Set(ids).size !== ids.length) fail('lens ids must be unique');
  for (const id of ids) {
    if ((RESERVED_STAGE_IDS as readonly string[]).includes(id)) fail(`lens id ${id} is reserved`);
  }
  for (const lens of lenses) {
    if (!(lens.samples >= definition.policy.evidence.minHits)) {
      fail(
        `lens ${lens.id} runs ${lens.samples} sample(s) but minHits is ${definition.policy.evidence.minHits}`,
      );
    }
    if (!(lens.maxItems >= 1 && lens.maxTokens >= 1))
      fail(`lens ${lens.id} needs maxItems and maxTokens ≥ 1`);
    if (lens.persona.trim().length === 0) fail(`lens ${lens.id} has an empty persona`);
  }
  checkFindingTypeOwners(definition, fail);
}

/**
 * A critic that declares its types declares ones the task knows, at least one;
 * and once any critic declares, every task type must be some critic's, or a
 * declared type would have no lens able to emit it.
 */
function checkFindingTypeOwners(definition: Definition, fail: Fail): void {
  const known = Object.keys(definition.task.findingTypes);
  const declaring = definition.critics.filter((lens) => lens.findingTypes !== undefined);
  if (declaring.length === 0) return;
  for (const lens of declaring) {
    const types = lens.findingTypes ?? [];
    if (types.length === 0) fail(`critic ${lens.id} declares no finding types`);
    for (const type of types) {
      if (!known.includes(type)) fail(`critic ${lens.id} declares unknown finding type ${type}`);
    }
  }
  const owned = new Set(definition.critics.flatMap((lens) => lens.findingTypes ?? known));
  for (const type of known) {
    if (!owned.has(type))
      fail(`finding type ${type} is declared by the task and owned by no critic`);
  }
}

/** Every criterion kind has exactly one judge, and every judge judges kinds that exist. */
function checkJudges(definition: Definition, fail: Fail): void {
  const judged = new Map<string, string>();
  for (const evaluator of definition.evaluators) {
    for (const kind of evaluator.criterionKinds) {
      if (!(kind in definition.task.criterionKinds))
        fail(`evaluator ${evaluator.id} judges unknown kind ${kind}`);
      const other = judged.get(kind);
      if (other) fail(`kind ${kind} is judged by both ${other} and ${evaluator.id}`);
      judged.set(kind, evaluator.id);
    }
  }
  for (const kind of Object.keys(definition.task.criterionKinds)) {
    if (!judged.has(kind)) fail(`kind ${kind} has no evaluator`);
  }
}

/**
 * A declared dependency on evidence nobody produces is a malformed pipeline:
 * the first wave must contain a lens of the kind that produces it. The same
 * for what the producer is briefed with.
 */
function checkWaves(definition: Definition, fail: Fail): void {
  const lenses = [...definition.critics, ...definition.evaluators];
  const firstWaveCritics = definition.critics.filter((lens) => lens.consumes.length === 0);
  const firstWaveEvaluators = definition.evaluators.filter((lens) => lens.consumes.length === 0);
  for (const lens of lenses) {
    for (const evidence of lens.consumes) {
      if (!(UPSTREAM_EVIDENCE as readonly string[]).includes(evidence))
        fail(`lens ${lens.id} consumes unknown evidence ${evidence}`);
    }
    if (lens.consumes.includes('findings') && firstWaveCritics.length === 0)
      fail(`lens ${lens.id} consumes findings but no critic runs before it`);

    if (lens.consumes.includes('results') && firstWaveEvaluators.length === 0)
      fail(`lens ${lens.id} consumes results but no evaluator runs before it`);
  }
  for (const briefing of definition.producer.consumes) {
    if (!(PRODUCER_BRIEFING as readonly string[]).includes(briefing))
      fail(`producer consumes unknown briefing ${briefing}`);
  }
}

/**
 * Every validator: a unique id the engine does not run itself, and what its
 * problems withhold — when it says — a declared withholding on a `warn`
 * validator. A failing `block` validator closes admission, so no reader ever
 * sees its problems: what one would withhold is a declaration about nothing.
 */
function checkValidators(definition: Definition, fail: Fail): void {
  const validatorIds = definition.validators.map((validator) => validator.id);
  if (new Set(validatorIds).size !== validatorIds.length) fail('validator ids must be unique');
  for (const id of validatorIds) {
    if (ENGINE_VALIDATOR_IDS.includes(id)) fail(`validator id ${id} is the engine's own`);
  }
  for (const { id, gate, withholds } of definition.validators) {
    if (withholds === undefined) continue;
    if (!(WITHHOLDINGS as readonly string[]).includes(withholds)) {
      fail(`validator ${id} withholds ${withholds}, not one of ${WITHHOLDINGS.join(', ')}`);
    }
    if (gate === 'block') {
      fail(
        `validator ${id} blocks, so no reader sees its problems and it may not declare withholds`,
      );
    }
  }
}

/**
 * Fixed criteria are graded with the rest, so each must be one the policy can
 * price — a declared kind, a non-empty statement within the deriver's own
 * target — and together they must leave the deriver room for what the goal
 * adds: a pipeline whose fixed criteria fill the cap would never derive.
 */
function checkFixedCriteria(definition: Definition, fail: Fail): void {
  const fixed = definition.task.fixedCriteria ?? [];
  if (fixed.length === 0) return;
  if (!(fixed.length < definition.task.maxCriteria)) {
    fail(
      `task.fixedCriteria declares ${fixed.length} of ${definition.task.maxCriteria} criteria, leaving none to derive`,
    );
  }
  const { target } = criterionLengthBound(definition.task);
  fixed.forEach((criterion, index) => {
    if (!(criterion.kind in definition.task.criterionKinds)) {
      fail(`task.fixedCriteria[${index}] has unknown kind ${criterion.kind}`);
    }
    const length = criterion.statement.trim().length;
    if (!(length >= 1 && length <= target)) {
      fail(`task.fixedCriteria[${index}] must be 1 to ${target} characters, not ${length}`);
    }
  });
}

function checkTask(definition: Definition, fail: Fail): void {
  if (!(GOAL_SOURCES as readonly string[]).includes(definition.goalSource)) {
    fail(`goalSource ${String(definition.goalSource)} is not one of ${GOAL_SOURCES.join(', ')}`);
  }
  if (!(definition.task.maxCriteria >= 1)) fail('task.maxCriteria must be ≥ 1');
  checkFixedCriteria(definition, fail);
  // A rubric the pipeline derives must be one a caller can hand back, to adopt an iteration it
  // judged — every statement its deriver can return, kept past the ceiling, through the HTTP edge.
  const bound = criterionLengthBound(definition.task);
  if (!(
    Number.isInteger(bound.target) &&
    bound.target >= 1 &&
    bound.ceiling >= bound.target &&
    providedStatementLimit(definition.task) <= MAX_PROVIDED_STATEMENT_LENGTH
  )) {
    fail(
      `task.statementBound must have an integer target from 1 and keep at most ${MAX_PROVIDED_STATEMENT_LENGTH} characters`,
    );
  }
}

/**
 * The controller is declared by reference and composed elsewhere; what boot
 * re-checks is its projection, since a hand-written controller never passed
 * through `composeController`.
 */
function checkController(definition: Definition, fail: Fail): void {
  const { controller } = definition;
  if (!controller || controller.id.trim().length === 0) fail('pipeline declares no controller');
  const factors = controller.summary.steps.map((step) => step.factor);
  if (factors.length === 0) fail(`controller ${controller.id} consults no factor`);
  if (factors.includes(SCORES_FACTOR)) {
    fail(`controller ${controller.id} takes the engine's factor ${SCORES_FACTOR}`);
  }
  if (new Set(factors).size !== factors.length) {
    fail(`controller ${controller.id} consults a factor twice`);
  }
}

/** Fails fast on a malformed pipeline — before boot completes, never mid-run. */
export function validatePipeline(definition: PipelineDefinition<unknown>): void {
  const name = describePipelineId(definition);
  const fail: Fail = (message) => {
    throw new Error(`pipeline ${name}: ${message}`);
  };

  validatePolicy(definition.policy, definition.task, name);
  checkLenses(definition, fail);
  checkJudges(definition, fail);
  checkWaves(definition, fail);
  checkTask(definition, fail);
  checkValidators(definition, fail);
  checkController(definition, fail);

  // The model is shown the output schema at its targets and the reply is read
  // against its ceilings, both from this one conversion: an unsupported zod
  // type, or a bound declared where none can sit, fails here rather than as a
  // null response mid-run.
  const shown = modelSchema(definition.task.output.schema);
  // A strict endpoint refuses the request for an open object or an optional
  // property, every time, before any model reads the goal — so the schema that
  // breaks the convention never boots instead of never producing.
  const faults = strictSchemaFaults(shown.json);
  if (faults.length > 0) {
    fail(`output schema is not strict — a strict endpoint refuses it: ${faults.join('; ')}`);
  }
}

const summariseLens = ({ id, samples, maxItems, maxTokens, consumes, findingTypes }: LensSpec) => ({
  id,
  samples,
  maxItems,
  maxTokens,
  consumes: [...consumes],
  ...(findingTypes === undefined ? {} : { findingTypes: [...findingTypes] }),
});

/** Key order is the summary's wire order: what it judges comes before what it consumes. */
const summariseEvaluator = ({
  id,
  samples,
  maxItems,
  maxTokens,
  criterionKinds,
  consumes,
}: EvaluatorSpec) => ({
  id,
  samples,
  maxItems,
  maxTokens,
  criterionKinds: [...criterionKinds],
  consumes: [...consumes],
});

/** The serialisable projection: what `GET /pipelines` returns and the dump stores. */
export function describePipeline(definition: PipelineDefinition<unknown>): PipelineSummary {
  const { task } = definition;
  return {
    id: definition.id,
    version: definition.version,
    description: definition.description,
    goalSource: definition.goalSource,
    task: {
      criterionKinds: { ...task.criterionKinds },
      findingTypes: { ...task.findingTypes },
      maxCriteria: task.maxCriteria,
      maxStatementLength: providedStatementLimit(task),
    },
    producer: { consumes: [...definition.producer.consumes] },
    validators: definition.validators.map(({ id, gate }) => ({ id, gate })),
    critics: definition.critics.map(summariseLens),
    evaluators: definition.evaluators.map(summariseEvaluator),
    controller: {
      id: definition.controller.summary.id,
      steps: definition.controller.summary.steps.map(projectStep),
    },
    policy: definition.policy,
  };
}
