/**
 * The loop: derive the contract, then per iteration produce (or adopt),
 * validate, judge, normalize, decide — and either act on the decision or stop
 * with a reason the runner owns. `finalDecision` says what the artifact
 * deserves next; `stopReason` says why the loop ended. Both are recorded.
 *
 * A produce that answers nothing costs its iteration, never the run: the
 * controller still decides it — no artifact, so it escalates, on the record —
 * and the loop asks again in the same mode from the best, told what the
 * schema refused. A run that ends on a lost produce — it lost more than its
 * policy allows (`loop.lostProduces`), or had no iteration left to ask in —
 * stops `produce-lost`. A produce that was judged and did not beat the best
 * leaves the best standing, and the next ask is told what its judges found.
 */
import {
  describeIssue,
  PRODUCE_MODES,
  type CriticReport,
  type Diagnostic,
  type EvaluationReport,
  type IterationMode,
  type IterationTrace,
  type LensOutcome,
  type ProduceMode,
  type RemediationNote,
  type RunTrace,
  type SchemaIssue,
  type StopReason,
  type SuccessCriterion,
} from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { RunProgress, TaskContract } from '../contracts';
import { annotate, noteRemediations } from '../evidence/annotate';
import { normalize } from '../evidence/normalize';
import { validatePipeline, type PipelineDefinition } from '../pipeline';
import {
  emptyUpstream,
  type AdvisoryMemory,
  type Critic,
  type DerivedCriteria,
  type Evaluator,
  type ExchangeSink,
  type LensContext,
  type Stages,
} from '../ports';
import { rubricOverruns } from '../stages/derive-criteria';
import {
  CRITERIA_STAGE,
  LENSES_STAGE,
  overrunDiagnostic,
  PRODUCER_STAGE,
  stageDiagnostic,
} from '../stages/shared';
import { materialize } from './materialize';
import { beats, progressOf } from './progress';
import { rubricProblems } from './rubric';
import { mapConcurrent } from './scoped-llm';

export interface RunInput {
  goal: string;
  /** A supplied artifact to judge; iteration 1 takes it as provided instead of producing. */
  output?: unknown;
  maxIterations?: number;
  /** A fixed rubric; when present the derive-criteria stage is not called. */
  criteria?: readonly SuccessCriterion[];
  /**
   * A recorded iteration of an earlier run, taken verbatim as iteration 1 in
   * mode `adopted` — no stage runs for it — and gone on from. Resolved by the
   * service (same pipeline and version, equal rubric), never by the loop.
   */
  adopted?: IterationTrace;
  /**
   * Advisory lessons for the producer alone, on every call it makes. Refused
   * unless the pipeline's producer declares it consumes `memories`; never
   * shown to the deriver or a lens, and never part of the contract.
   */
  memories?: readonly AdvisoryMemory[];
}

/**
 * Called once per finished iteration, in order, with the run so far — the
 * extension point a host publishes progress through while the loop is still
 * running. Synchronous on purpose: the loop never waits on what the host does
 * with it, and a host that writes somewhere slow queues the write itself.
 */
export type IterationListener = (progress: RunProgress) => void;

export interface RunDeps {
  llm: LlmClient;
  sink: ExchangeSink;
  now: () => number;
  onIteration?: IterationListener;
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
  if ((input.memories?.length ?? 0) > 0 && !definition.producer.consumes.includes('memories')) {
    throw new Error(`pipeline ${definition.id}: its producer does not consume memories`);
  }
  return runLoop(
    materialize(definition, deps.llm, deps.sink),
    definition,
    input,
    deps.now,
    deps.onIteration,
  );
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

/** One sample's outcome, tagged by which half of the wave it came from. */
type LensResult =
  | { critic: LensOutcome<CriticReport>; evaluator?: undefined }
  | { evaluator: LensOutcome<EvaluationReport>; critic?: undefined };

export async function runLoop<T>(
  stages: Stages<T>,
  definition: PipelineDefinition<T>,
  input: RunInput,
  now: () => number,
  onIteration?: IterationListener,
): Promise<RunTrace<T>> {
  const { policy, task } = definition;
  const maxIterations = Math.max(1, input.maxIterations ?? policy.loop.maxIterations);

  const derived = await deriveOrAdopt(stages, task, input);
  const contract: TaskContract<T> = { ...task, goal: input.goal, criteria: derived.criteria ?? [] };
  const loop: Loop<T> = {
    stages,
    definition,
    contract,
    input,
    baseDiagnostics: [
      ...(derived.diagnostic ? [derived.diagnostic] : []),
      ...derived.overruns.map((overrun) => overrunDiagnostic(CRITERIA_STAGE, overrun)),
    ],
    now,
  };

  const head = {
    pipeline: { id: definition.id, version: definition.version },
    contract: { goal: input.goal, criteria: contract.criteria },
  };
  const iterations: IterationTrace<T>[] = [];
  let standing: RunProgress<T> | null = null;
  let best: IterationTrace<T> | null = null;
  let stalled = 0;
  let mode: IterationMode =
    input.adopted !== undefined ? 'adopted' : input.output !== undefined ? 'provided' : 'initial';
  let stop: StopReason | null = null;
  let lost = 0;

  for (let iteration = 1; iteration <= maxIterations && stop === null; iteration++) {
    const previous = iterations[iterations.length - 1] ?? null;
    const entry: IterationTrace<T> =
      mode === 'adopted'
        ? adoptIteration(input.adopted as IterationTrace<T>, iteration)
        : await runIteration(loop, iteration, mode, best, previous);
    iterations.push(entry);

    const produceLost = lostProduce(entry);
    if (produceLost) lost += 1;
    // A lost produce never beats a best with an artifact, and was no revision that failed to improve.
    if (beats(entry, best)) {
      best = entry;
      stalled = 0;
    } else if (!produceLost) {
      stalled += 1;
    }
    standing = progressOf(head, iterations);
    if (standing !== null) onIteration?.(standing);

    const budget = { last: iteration === maxIterations };
    const next = produceLost
      ? afterLostProduce(entry, lost, policy.loop.lostProduces, budget)
      : afterDecision(entry, stages, policy.loop.plateauAfter, stalled, budget);
    if ('stop' in next) stop = next.stop;
    else mode = next.mode;
  }

  // The budget is at least one iteration, so the loop always stands somewhere.
  if (standing === null) throw new Error(`pipeline ${definition.id}: no iteration ran`);
  // What every listener was handed last, plus why the loop stopped.
  return { ...standing, stopReason: stop ?? 'max-iterations' };
}

/**
 * A supplied rubric is used verbatim — its ids are what the caller cites
 * across runs — so the deriver is never asked. Its statements are measured
 * against the bound the deriver writes within, as a derived one is: past the
 * target is an overrun on the record (past the longest its deriver can return
 * it was refused before the run started).
 */
function deriveOrAdopt<T>(
  stages: Stages<T>,
  task: PipelineDefinition<T>['task'],
  input: RunInput,
): Promise<DerivedCriteria> {
  return input.criteria !== undefined
    ? Promise.resolve({
        criteria: input.criteria.map((criterion) => ({ ...criterion })),
        diagnostic: null,
        overruns: rubricOverruns(input.criteria, task),
      })
    : stages.deriveCriteria(input.goal);
}

/**
 * A recorded iteration taken as this run's own: ledger, decision,
 * remediations and locations verbatim, renumbered, in mode `adopted`. The
 * loop then goes on exactly as it would from a decision it made itself.
 */
const adoptIteration = <T>(source: IterationTrace<T>, iteration: number): IterationTrace<T> => ({
  ...structuredClone(source),
  iteration,
  mode: 'adopted',
});

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
  diagnostics.push(...produced.diagnostics);

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
 * the normalized value is what the lenses judge and the trace stores. What
 * the producer reports comes back as diagnostics: why it answered nothing,
 * and one `overrun` per field it wrote past the size it was asked for.
 */
async function produceOrAdopt<T>(
  loop: Loop<T>,
  mode: ProduceMode | 'provided',
  best: IterationTrace<T> | null,
  previous: IterationTrace<T> | null,
): Promise<{ artifact: T | null; diagnostics: Diagnostic[] }> {
  if (mode === 'provided') return { artifact: loop.input.output as T, diagnostics: [] };
  const produced = await loop.stages.producer.produce({
    contract: loop.contract,
    mode,
    prior: mode === 'revise' ? (best?.artifact ?? null) : null,
    remediations: best?.remediations ?? [],
    refusals: refusalsOf(previous, best),
    setbacks: setbacksOf(previous, best),
    memories: loop.input.memories ?? [],
  });
  const { output } = loop.definition.task;
  const artifact =
    produced.output !== null && output.normalize
      ? output.normalize(produced.output, loop.contract)
      : produced.output;
  return {
    artifact,
    diagnostics: [
      ...(produced.diagnostic ? [produced.diagnostic] : []),
      ...produced.overruns.map((overrun) => overrunDiagnostic(PRODUCER_STAGE, overrun)),
    ],
  };
}

const wasBlocked = <T>(entry: IterationTrace<T>): boolean =>
  entry.validation.some((report) => report.gate === 'block' && report.problems.length > 0);

/** An iteration the loop asked the producer for, which answered nothing. */
const lostProduce = <T>(entry: IterationTrace<T>): boolean =>
  entry.artifact === null && (PRODUCE_MODES as readonly string[]).includes(entry.mode);

/** The faults the schema refused a lost produce's reply for — kept on its diagnostic, never re-parsed. */
const refusedIssues = <T>(entry: IterationTrace<T>): SchemaIssue[] =>
  entry.ledger.diagnostics
    .filter((diagnostic) => diagnostic.stage === PRODUCER_STAGE)
    .flatMap((diagnostic) => diagnostic.facts?.issues ?? []);

/** One note per fault, in the one wording; a fault noted and not refused is no more than info. */
const schemaRefusal = (issue: SchemaIssue): RemediationNote => ({
  subject: { schema: issue.path },
  action: 'retry',
  severity: issue.soft ? 'info' : 'critical',
  targetRefs: [],
  note: describeIssue(issue),
});

/**
 * Why the attempt just before was refused before any judge read it, when it
 * was. A produce that answered nothing: the faults the schema refused its
 * reply for, so the ask that replaces it names them. An iteration a validator
 * blocked that never became best: the validator notes — the producer revises
 * the best artifact with the best remediations, so nothing else would tell it
 * why its last attempt was refused.
 */
const refusalsOf = <T>(
  previous: IterationTrace<T> | null,
  best: IterationTrace<T> | null,
): RemediationNote[] => {
  if (previous === null) return [];
  if (lostProduce(previous)) return refusedIssues(previous).map(schemaRefusal);
  return previous !== best && wasBlocked(previous)
    ? previous.remediations.filter((note) => 'validator' in note.subject)
    : [];
};

/** An iteration the lenses read: it had an artifact and no validator blocked it. */
const wasJudged = <T>(entry: IterationTrace<T>): boolean =>
  entry.artifact !== null && !wasBlocked(entry);

const findingOf = (note: RemediationNote): string | null =>
  'finding' in note.subject ? note.subject.finding : null;

/**
 * What the judges confirmed wrong with the attempt just before, when it was
 * judged and did not become best. The producer revises the best with the
 * best's remediations, so without these it never hears what its last attempt
 * got wrong — and, handed the same brief, writes the same thing again. Its
 * finding notes only, as the policy selected them; a finding the best's
 * remediations already name (the same key, the identity `deriveLessons`
 * compares iterations by) is said there once.
 */
const setbacksOf = <T>(
  previous: IterationTrace<T> | null,
  best: IterationTrace<T> | null,
): RemediationNote[] => {
  if (previous === null || previous === best || !wasJudged(previous)) return [];
  const held = new Set((best?.remediations ?? []).flatMap((note) => findingOf(note) ?? []));
  return previous.remediations.filter((note) => {
    const finding = findingOf(note);
    return finding !== null && !held.has(finding);
  });
};

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

/**
 * One wave, every lens SAMPLE an independent unit, at most `concurrency` in
 * flight, results in declaration order.
 *
 * The unit is the sample rather than the lens because a lens's samples have
 * nothing to say to each other: they are separate draws whose agreement is the
 * signal. Scheduling the lens meant one slot carried a lens's samples one
 * after another, so a wave finished at the pace of its slowest lens rather
 * than its slowest call, with the other slots idle.
 *
 * Every prompt is built first, by `plan`, and `mapConcurrent` writes each
 * result back into its own position — so what comes out is ordered by
 * declaration and ascending sample whatever order the answers arrived in.
 * `wave-order.spec.ts` is the guard on that, and it is load-bearing: three
 * things downstream read this array's order, and all three reach the grade.
 */
async function runWave<T>(
  critics: readonly Critic<T>[],
  evaluators: readonly Evaluator<T>[],
  ctx: LensContext<T>,
  concurrency: number,
): Promise<Judged> {
  const units: (() => Promise<LensResult>)[] = [
    ...critics.flatMap((critic) =>
      critic.plan(ctx).map((unit) => async (): Promise<LensResult> => ({ critic: await unit() })),
    ),
    ...evaluators.flatMap((evaluator) =>
      evaluator
        .plan(ctx)
        .map((unit) => async (): Promise<LensResult> => ({ evaluator: await unit() })),
    ),
  ];
  const results = await mapConcurrent(units, concurrency, (run) => run());
  return {
    critics: results.flatMap((result) => (result.critic ? [result.critic] : [])),
    evaluators: results.flatMap((result) => (result.evaluator ? [result.evaluator] : [])),
  };
}

/**
 * A lost produce goes round again in the same mode — from the best, which it
 * left unchanged — while the run has produce calls to lose and an iteration
 * to ask in. Otherwise the run ends on the lost produce, and says so:
 * `produce-lost`, whichever of the two ran out.
 */
function afterLostProduce<T>(
  entry: IterationTrace<T>,
  lost: number,
  lostProduces: number,
  budget: { last: boolean },
): { stop: StopReason } | { mode: ProduceMode } {
  return lost > lostProduces || budget.last
    ? { stop: 'produce-lost' }
    : { mode: entry.mode as ProduceMode };
}

/**
 * What the decision means for the loop: a terminal decision stops it with
 * its reason; otherwise the loop stops for a reason of its own — a plateau,
 * the budget — or goes round again in the mode decided.
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
      if (stalled >= plateauAfter) return { stop: 'plateau' };
      if (budget.last) return { stop: 'max-iterations' };
      return { mode: entry.decision.finalDecision };
  }
}
