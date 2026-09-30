/**
 * The loop: derive the contract, then per iteration produce (or adopt),
 * validate, judge, normalize, decide — and either act on the decision or stop
 * with a reason the runner owns. `finalDecision` says what the artifact
 * deserves next; `stopReason` says why the loop ended. Both are recorded.
 */
import type {
  CriticReport,
  Diagnostic,
  EvaluationReport,
  IterationTrace,
  LensOutcome,
  ProduceMode,
  RemediationNote,
  RunTrace,
  StopReason,
  SuccessCriterion,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { TaskContract } from '../contracts';
import { annotate, noteRemediations } from '../evidence/annotate';
import { deriveLessons } from '../evidence/lessons';
import { normalize } from '../evidence/normalize';
import { validatePipeline, type PipelineDefinition } from '../pipeline';
import {
  emptyUpstream,
  type Critic,
  type Evaluator,
  type ExchangeSink,
  type LensContext,
  type Stages,
} from '../ports';
import { LENSES_STAGE, stageDiagnostic } from '../stages/shared';
import { materialize } from './materialize';
import { rubricProblems } from './rubric';
import { mapConcurrent } from './scoped-llm';

export interface RunInput {
  goal: string;
  /** A supplied artifact to judge; iteration 1 adopts it instead of producing. */
  output?: unknown;
  maxIterations?: number;
  /** A fixed rubric; when present the derive-criteria stage is not called. */
  criteria?: readonly SuccessCriterion[];
}

export interface RunDeps {
  llm: LlmClient;
  sink: ExchangeSink;
  now: () => number;
}

export async function runPipeline<T>(
  definition: PipelineDefinition<T>,
  input: RunInput,
  deps: RunDeps,
): Promise<RunTrace<T>> {
  validatePipeline(definition as PipelineDefinition<unknown>);
  const problems = input.criteria ? rubricProblems(input.criteria, definition.task) : [];
  if (problems.length > 0) {
    throw new Error(`pipeline ${definition.id}: rubric rejected: ${problems.join('; ')}`);
  }
  return runLoop(materialize(definition, deps.llm, deps.sink), definition, input, deps.now);
}

/** Everything one iteration reads and never changes: the stages, the contract, the request. */
interface Loop<T> {
  stages: Stages<T>;
  definition: PipelineDefinition<T>;
  contract: TaskContract<T>;
  input: RunInput;
  /** What deriving the contract reported; every iteration starts from it. */
  baseDiagnostics: readonly Diagnostic[];
  now: () => number;
}

type Judged = { critics: LensOutcome<CriticReport>[]; evaluators: LensOutcome<EvaluationReport>[] };

type LensResult =
  | { critic: LensOutcome<CriticReport>[]; evaluator?: undefined }
  | { evaluator: LensOutcome<EvaluationReport>[]; critic?: undefined };

export async function runLoop<T>(
  stages: Stages<T>,
  definition: PipelineDefinition<T>,
  input: RunInput,
  now: () => number,
): Promise<RunTrace<T>> {
  const { policy, task } = definition;
  const maxIterations = Math.max(1, input.maxIterations ?? policy.loop.maxIterations);

  const derived = await deriveOrAdopt(stages, input);
  const contract: TaskContract<T> = { ...task, goal: input.goal, criteria: derived.criteria ?? [] };
  const loop: Loop<T> = {
    stages,
    definition,
    contract,
    input,
    baseDiagnostics: derived.diagnostic ? [derived.diagnostic] : [],
    now,
  };

  const iterations: IterationTrace<T>[] = [];
  let best: IterationTrace<T> | null = null;
  let stalled = 0;
  let mode: ProduceMode | 'provided' = input.output !== undefined ? 'provided' : 'initial';
  let stop: StopReason | null = null;

  for (let iteration = 1; iteration <= maxIterations && stop === null; iteration++) {
    const previous = iterations[iterations.length - 1] ?? null;
    const entry: IterationTrace<T> = await runIteration(loop, iteration, mode, best, previous);
    iterations.push(entry);

    if (beats(entry, best)) {
      best = entry;
      stalled = 0;
    } else {
      stalled += 1;
    }

    const next = afterDecision(entry, stages, policy.loop.plateauAfter, stalled, {
      last: iteration === maxIterations,
    });
    if ('stop' in next) stop = next.stop;
    else mode = next.mode;
  }

  const last = iterations[iterations.length - 1];
  return {
    pipeline: { id: definition.id, version: definition.version },
    contract: { goal: input.goal, criteria: contract.criteria },
    iterations,
    bestIteration: (best ?? last).iteration,
    finalDecision: last.decision.finalDecision,
    stopReason: stop ?? 'max-iterations',
    lessons: deriveLessons(iterations),
  };
}

/**
 * A supplied rubric is used verbatim — its ids are what the caller cites
 * across runs — so the deriver is never asked.
 */
function deriveOrAdopt<T>(
  stages: Stages<T>,
  input: RunInput,
): Promise<{ criteria: SuccessCriterion[] | null; diagnostic: Diagnostic | null }> {
  return input.criteria !== undefined
    ? Promise.resolve({
        criteria: input.criteria.map((criterion) => ({ ...criterion })),
        diagnostic: null,
      })
    : stages.deriveCriteria(input.goal);
}

/** Produce, validate, judge, normalize, decide — one iteration, timed end to end. */
async function runIteration<T>(
  loop: Loop<T>,
  iteration: number,
  mode: ProduceMode | 'provided',
  best: IterationTrace<T> | null,
  previous: IterationTrace<T> | null,
): Promise<IterationTrace<T>> {
  const { stages, contract, now } = loop;
  const { policy, task } = loop.definition;
  const startedAt = now();
  const diagnostics = [...loop.baseDiagnostics];

  const produced = await produceOrAdopt(loop, mode, best, previous);
  const { artifact } = produced;
  if (produced.diagnostic) diagnostics.push(produced.diagnostic);

  const validation =
    artifact === null
      ? []
      : stages.validators.map((validator) => validator.validate(artifact as T, contract));
  const blocked = validation.some(
    (report) => report.gate === 'block' && report.problems.length > 0,
  );
  const judgeable = artifact !== null && !blocked;
  const locations = judgeable ? task.output.locate(artifact as T) : [];
  const rendered = judgeable ? task.output.render(artifact as T) : null;

  let judged: Judged = { critics: [], evaluators: [] };
  if (judgeable && contract.criteria.length > 0) {
    judged = await runLensWaves(
      stages,
      {
        contract,
        artifact: artifact as T,
        locations,
        rendered: rendered ?? '',
        validation,
        upstream: emptyUpstream(),
      },
      policy,
    );
  } else {
    diagnostics.push(
      stageDiagnostic(LENSES_STAGE, 'not-applicable', notApplicableDetail(artifact, blocked)),
    );
  }
  const { critics, evaluators } = judged;

  const confirmed = normalize(
    {
      contract,
      artifactPresent: artifact !== null,
      locations,
      validation,
      critics,
      evaluators,
      diagnostics,
    },
    policy,
  );
  // The words ride on the ledger for readers of the trace; the controller
  // decides on the structural fields beside them and never reads prose.
  const ledger = { ...confirmed, findings: annotate(confirmed.findings, critics, locations) };
  const decision = stages.controller.decide(ledger, policy);
  const remediations = noteRemediations(
    decision.selectedRemediations,
    ledger.findings,
    contract,
    evaluators,
    validation,
  );

  return {
    iteration,
    mode,
    artifact,
    locations,
    rendered,
    validation,
    critics,
    evaluators,
    ledger,
    decision,
    remediations,
    durationMs: now() - startedAt,
  };
}

/**
 * Iteration 1 adopts a provided artifact exactly as handed in; every other
 * iteration asks the producer, and what it produced passes through the
 * output shape's `normalize` (when declared) before any validator sees it —
 * the normalized value is what the lenses judge and the trace stores.
 */
async function produceOrAdopt<T>(
  loop: Loop<T>,
  mode: ProduceMode | 'provided',
  best: IterationTrace<T> | null,
  previous: IterationTrace<T> | null,
): Promise<{ artifact: T | null; diagnostic: Diagnostic | null }> {
  if (mode === 'provided') return { artifact: loop.input.output as T, diagnostic: null };
  const produced = await loop.stages.producer.produce({
    contract: loop.contract,
    mode,
    prior: mode === 'revise' ? (best?.artifact ?? null) : null,
    remediations: best?.remediations ?? [],
    refusals: refusalsOf(previous, best),
  });
  const { output } = loop.definition.task;
  const artifact =
    produced.output !== null && output.normalize
      ? output.normalize(produced.output, loop.contract)
      : produced.output;
  return { artifact, diagnostic: produced.diagnostic };
}

const wasBlocked = <T>(entry: IterationTrace<T>): boolean =>
  entry.validation.some((report) => report.gate === 'block' && report.problems.length > 0);

/**
 * The validator notes of the iteration just before, when a validator blocked
 * it and it never became best: the producer revises the best artifact with
 * the best remediations, so nothing else would tell it why its last attempt
 * was refused.
 */
const refusalsOf = <T>(
  previous: IterationTrace<T> | null,
  best: IterationTrace<T> | null,
): RemediationNote[] =>
  previous !== null && previous !== best && wasBlocked(previous)
    ? previous.remediations.filter((note) => 'validator' in note.subject)
    : [];

const notApplicableDetail = (artifact: unknown, blocked: boolean): string =>
  artifact === null ? 'no artifact' : blocked ? 'blocked by a validator' : 'no criteria derived';

/**
 * Two waves, by declaration. Lenses that consume nothing judge the artifact
 * alone; what the normaliser CONFIRMS from them is what the second wave is
 * shown. The deterministic normaliser is the boundary between tiers — a
 * downstream lens never sees a raw report.
 */
async function runLensWaves<T>(
  stages: Stages<T>,
  ctx: LensContext<T>,
  policy: PipelineDefinition<T>['policy'],
): Promise<Judged> {
  const firstWave = <L extends { consumes: readonly unknown[] }>(lenses: readonly L[]): L[] =>
    lenses.filter((lens) => lens.consumes.length === 0);
  const laterWave = <L extends { consumes: readonly unknown[] }>(lenses: readonly L[]): L[] =>
    lenses.filter((lens) => lens.consumes.length > 0);

  const first = await runWave(
    firstWave(stages.critics),
    firstWave(stages.evaluators),
    ctx,
    policy.loop.concurrency,
  );
  const laterCritics = laterWave(stages.critics);
  const laterEvaluators = laterWave(stages.evaluators);
  if (laterCritics.length + laterEvaluators.length === 0) return first;

  const confirmed = normalize(
    {
      contract: ctx.contract,
      artifactPresent: true,
      locations: ctx.locations,
      validation: ctx.validation,
      critics: first.critics,
      evaluators: first.evaluators,
      diagnostics: [],
    },
    policy,
  );
  const second = await runWave(
    laterCritics,
    laterEvaluators,
    {
      ...ctx,
      upstream: {
        findings: annotate(confirmed.findings, first.critics, ctx.locations),
        results: confirmed.criteria.filter((evidence) => evidence.result !== 'unassessed'),
      },
    },
    policy.loop.concurrency,
  );
  return {
    critics: [...first.critics, ...second.critics],
    evaluators: [...first.evaluators, ...second.evaluators],
  };
}

/** One wave of lenses, concurrently, results in declaration order. */
async function runWave<T>(
  critics: readonly Critic<T>[],
  evaluators: readonly Evaluator<T>[],
  ctx: LensContext<T>,
  concurrency: number,
): Promise<Judged> {
  const units: (() => Promise<LensResult>)[] = [
    ...critics.map((critic) => async (): Promise<LensResult> => ({
      critic: await critic.run(ctx),
    })),
    ...evaluators.map((evaluator) => async (): Promise<LensResult> => ({
      evaluator: await evaluator.run(ctx),
    })),
  ];
  const results = await mapConcurrent(units, concurrency, (run) => run());
  return {
    critics: results.flatMap((result) => result.critic ?? []),
    evaluators: results.flatMap((result) => result.evaluator ?? []),
  };
}

/** The strict-better gate: a revision keeps the crown only by beating it. */
const beats = <T>(entry: IterationTrace<T>, best: IterationTrace<T> | null): boolean =>
  best === null || entry.decision.scores.overall > best.decision.scores.overall;

/**
 * What the decision means for the loop: a terminal decision stops it with
 * its reason; otherwise the loop stops for a reason of its own — no producer,
 * a plateau, the budget — or goes round again in the mode decided.
 */
function afterDecision<T>(
  entry: IterationTrace<T>,
  stages: Stages<T>,
  plateauAfter: number,
  stalled: number,
  budget: { last: boolean },
): { stop: StopReason } | { mode: ProduceMode } {
  switch (entry.decision.finalDecision) {
    case 'accept':
      return { stop: 'accepted' };
    case 'reject':
      return { stop: 'rejected' };
    case 'escalate':
      return { stop: 'escalated' };
    default:
      if (!stages.producer.enabled) return { stop: 'producer-unavailable' };
      if (stalled >= plateauAfter) return { stop: 'plateau' };
      if (budget.last) return { stop: 'max-iterations' };
      return { mode: entry.decision.finalDecision };
  }
}
